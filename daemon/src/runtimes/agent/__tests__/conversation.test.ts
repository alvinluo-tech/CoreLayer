import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCredentials: Record<string, string> = {};

vi.mock("../../../config/config-manager.js", () => ({
  configManager: {
    getCredentials: vi.fn(() => mockCredentials),
    getConfig: vi.fn(() => ({ providers: [] })),
    getProviderConfig: vi.fn(() => ({ baseURL: "", apiKey: "" })),
    getActiveModel: vi.fn(() => "auto"),
    getMaxSteps: vi.fn(() => 10),
    getTurnTimeout: vi.fn(() => 120_000),
    getStreamTimeout: vi.fn(() => 60_000),
  },
}));

vi.mock("ai", () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
  stepCountIs: vi.fn(() => true),
}));

vi.mock("../application/prompt-builder.js", () => ({
  buildSystemPrompt: vi.fn(() => "system prompt"),
  buildTickSystemPrompt: vi.fn(() => "tick prompt"),
}));

vi.mock("../../../gateways/ai-provider/provider.js", () => ({
  getModel: vi.fn(() => ({})),
}));

vi.mock("../../tool/adapters/native-tools/registry.js", () => ({
  getRegistry: () => ({ resolveTool: () => null, getTool: () => null }),
  registerJarvisTool: vi.fn(),
  registerTool: vi.fn(),
  getTool: vi.fn(() => null),
  getAllJarvisTools: vi.fn(() => []),
  getAllTools: vi.fn(() => []),
}));

vi.mock("../../../persistence/factory.js", () => {
  const addMessage = vi.fn(async (_id: string, data: Record<string, unknown>) => ({
    id: "msg-" + Math.random().toString(36).slice(2, 8),
    conversationId: _id,
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  const conversations = {
    addMessage,
    getById: vi.fn(async () => ({
      id: "conv-1",
      title: "New Chat",
      messageCount: 0,
      modelUsed: "mimo-2.5-pro",
    })),
    getMessages: vi.fn(async () => []),
    update: vi.fn(async () => ({})),
    updateTokenUsage: vi.fn(async () => ({})),
    markMessagesCompressed: vi.fn(async () => ({})),
  };
  const memories = {
    fetchRelevantMemories: vi.fn(async () => []),
    getAll: vi.fn(async () => []),
    upsert: vi.fn(async (m: Record<string, unknown>) => ({ id: "mem-1", ...m })),
    upsertPreferences: vi.fn(async () => ({})),
  };
  const repos = { conversations, memories };
  return { getRepositories: vi.fn(() => repos) };
});

vi.mock("../../../shared/errors.js", () => ({
  classifyError: vi.fn(() => ({ code: "UNKNOWN", status: 500 })),
  extractErrorMessage: vi.fn(() => "mock error"),
  logError: vi.fn(),
}));

vi.mock("../../tool/public-api.js", () => ({
  getAllTools: vi.fn(() => []),
  wrapToolsForAI: vi.fn(() => ({})),
  getTool: vi.fn(() => null),
}));

vi.mock("../../../gateways/model/gateway.js", () => ({
  getModelGateway: vi.fn(() => ({
    selectModel: vi.fn(() => "mimo-2.5-pro"),
    getModel: vi.fn(() => ({})),
    getProfile: vi.fn(() => ({ displayName: "Mimo 2.5 Pro" })),
  })),
}));

vi.mock("../application/context-builder.js", () => ({
  ContextBuilder: vi.fn().mockImplementation(() => ({
    withSummary: vi.fn().mockReturnThis(),
    build: vi.fn(async () => ({
      messages: [
        { role: "system", content: "You are Jarvis" },
        { role: "user", content: "hello" },
      ],
      historyTruncated: false,
      shouldCompress: false,
      compressionUrgency: "none",
      tokens: { system: 100, memory: 0, history: 50, total: 150, budget: 128000 },
      toolsUsed: [],
      cacheEnabled: false,
      debug: vi.fn(() => ({})),
    })),
  })),
  MEMORY_MIN_SCORE: 0.3,
}));

vi.mock("../application/compressor.js", () => ({
  compressConversation: vi.fn(async () => ({
    summary: "compressed summary",
    compressedMessages: [],
    extractedPreferences: [],
  })),
  createSummaryMessage: vi.fn((_id: string, _s: string, _c: number) => ({
    id: "summary-msg", role: "system",
    content: `[对话摘要] ${_c} 条消息已压缩\n\n${_s}`,
  })),
  extractMemoriesFromTurn: vi.fn(async () => []),
}));

vi.mock("../../../workspaces/task-status.js", () => ({
  isTaskComplete: vi.fn((s: string) => s === "completed" || s === "done"),
}));

vi.mock("../../scheduler/public-api.js", () => ({
  recordActivity: vi.fn(),
}));

import {
  isAiConfigured,
  generateTitleFromMessage,
  LoopBreaker,
  injectLoopBreakerWarning,
  IterationBudget,
  injectBudgetWarning,
  ForceAnswerDetector,
  guardEmptyResponse,
  applyCacheControl,
  logCacheStats,
  streamMessageInConversation,
  handleMessageInConversation,
  streamChat,
  handleMessage,
} from "../application/conversation.js";
import { configManager } from "../../../config/config-manager.js";
import { getRepositories } from "../../../persistence/factory.js";
import { generateText, streamText } from "ai";
import { recordActivity } from "../../scheduler/public-api.js";

// ---- isAiConfigured ----
describe("isAiConfigured", () => {
  beforeEach(() => {
    Object.keys(mockCredentials).forEach((k) => delete mockCredentials[k]);
  });
  it("returns true when a credential is set", () => {
    mockCredentials["mimo"] = "test-key";
    expect(isAiConfigured()).toBe(true);
  });
  it("returns false when no credentials exist", () => {
    expect(isAiConfigured()).toBe(false);
  });
  it("returns false when all credentials are empty strings", () => {
    mockCredentials["mimo"] = "";
    expect(isAiConfigured()).toBe(false);
  });
});

// ---- generateTitleFromMessage ----
describe("generateTitleFromMessage", () => {
  it("returns message when <= 30 chars", () => {
    expect(generateTitleFromMessage("a".repeat(30))).toBe("a".repeat(30));
  });
  it("truncates to 30 + '...' when > 30", () => {
    expect(generateTitleFromMessage("a".repeat(31))).toBe("a".repeat(30) + "...");
  });
  it("replaces newlines with spaces", () => {
    expect(generateTitleFromMessage("a\nb")).toBe("a b");
  });
  it("trims whitespace", () => {
    expect(generateTitleFromMessage("  hi  ")).toBe("hi");
  });
});

// ---- LoopBreaker ----
describe("LoopBreaker", () => {
  it("starts with no state", () => {
    const b = new LoopBreaker();
    expect(b.recordToolCall("s", { q: "a" }).stuck).toBe(false);
  });
  it("flags stuck after 4 same-args calls", () => {
    const b = new LoopBreaker();
    b.recordToolCall("s", { q: "x" });
    b.recordToolCall("s", { q: "x" });
    b.recordToolCall("s", { q: "x" });
    expect(b.recordToolCall("s", { q: "x" }).stuck).toBe(true);
  });
  it("flags excessive at 10 calls", () => {
    const b = new LoopBreaker();
    for (let i = 0; i < 9; i++) b.recordToolCall("s", { q: `q${i}` });
    expect(b.recordToolCall("s", { q: "q9" }).excessive).toBe(true);
  });
  it("reset clears state", () => {
    const b = new LoopBreaker();
    b.recordToolCall("s", { q: "x" });
    b.recordToolCall("s", { q: "x" });
    b.recordToolCall("s", { q: "x" });
    b.recordToolCall("s", { q: "x" });
    b.reset();
    expect(b.recordToolCall("s", { q: "x" }).stuck).toBe(false);
  });
});

// ---- injectLoopBreakerWarning ----
describe("injectLoopBreakerWarning", () => {
  it("injects into output field", () => {
    const r = injectLoopBreakerWarning([{ output: "data" }]);
    expect(r[0].output).toContain("检测到工具调用循环");
  });
  it("injects into result field", () => {
    const r = injectLoopBreakerWarning([{ result: "data" }]);
    expect(r[0].result).toContain("检测到工具调用循环");
  });
  it("returns empty array unchanged", () => {
    expect(injectLoopBreakerWarning([])).toEqual([]);
  });
});

// ---- IterationBudget ----
describe("IterationBudget", () => {
  it("sets threshold at 80% of maxSteps", () => {
    const b = new IterationBudget(10);
    expect(b.step).toBe(0);
    expect(b.shouldWarn).toBe(false);
  });
  it("returns false before threshold", () => {
    const b = new IterationBudget(10);
    for (let i = 0; i < 7; i++) expect(b.advance()).toBe(false);
  });
  it("returns true at threshold exactly once", () => {
    const b = new IterationBudget(10);
    for (let i = 0; i < 7; i++) b.advance();
    expect(b.advance()).toBe(true); // step 8 = threshold
    expect(b.advance()).toBe(false); // already warned
  });
  it("handles maxSteps of 1", () => {
    const b = new IterationBudget(1);
    expect(b.advance()).toBe(true);
  });
});

// ---- injectBudgetWarning ----
describe("injectBudgetWarning", () => {
  it("injects into output field", () => {
    const r = injectBudgetWarning([{ output: "data" }]);
    expect(r[0].output).toContain("迭代次数上限");
  });
  it("injects into result field", () => {
    const r = injectBudgetWarning([{ result: "data" }]);
    expect(r[0].result).toContain("迭代次数上限");
  });
  it("returns empty array unchanged", () => {
    expect(injectBudgetWarning([])).toEqual([]);
  });
  it("does not mutate original", () => {
    const orig = [{ output: "data" }];
    injectBudgetWarning(orig);
    expect(orig[0].output).toBe("data");
  });
});

// ---- ForceAnswerDetector ----
describe("ForceAnswerDetector", () => {
  it("returns false with no steps", () => {
    const d = new ForceAnswerDetector();
    expect(d.recordStep({})).toBe(false);
  });
  it("returns false when step has text", () => {
    const d = new ForceAnswerDetector();
    expect(d.recordStep({ text: "hi", toolCalls: [{}] })).toBe(false);
  });
  it("increments on tool-only rounds", () => {
    const d = new ForceAnswerDetector();
    d.recordStep({ toolCalls: [{}] });
    d.recordStep({ toolCalls: [{}] });
    expect(d.recordStep({ toolCalls: [{}] })).toBe(true);
    expect(d.count).toBe(3);
  });
  it("resets when text appears", () => {
    const d = new ForceAnswerDetector();
    d.recordStep({ toolCalls: [{}] });
    d.recordStep({ toolCalls: [{}] });
    d.recordStep({ text: "response", toolCalls: [{}] });
    expect(d.count).toBe(0);
  });
  it("reset clears state", () => {
    const d = new ForceAnswerDetector();
    d.recordStep({ toolCalls: [{}] });
    d.recordStep({ toolCalls: [{}] });
    d.recordStep({ toolCalls: [{}] });
    d.reset();
    expect(d.count).toBe(0);
  });
});

// ---- guardEmptyResponse ----
describe("guardEmptyResponse", () => {
  it("returns text when non-empty", () => {
    expect(guardEmptyResponse({ text: "hello" })).toBe("hello");
  });
  it("returns reasoning string when text empty", () => {
    expect(guardEmptyResponse({ text: "", reasoning: "thinking" })).toBe("thinking");
  });
  it("returns combined reasoning array", () => {
    const r = guardEmptyResponse({ text: "", reasoning: [{ text: "a" }, { text: "b" }] });
    expect(r).toBe("a\nb");
  });
  it("filters empty reasoning entries", () => {
    expect(guardEmptyResponse({ text: "", reasoning: [{ text: "" }, { text: "x" }] })).toBe("x");
  });
  it("returns empty text when reasoning empty", () => {
    expect(guardEmptyResponse({ text: "", reasoning: "" })).toBe("");
    expect(guardEmptyResponse({ text: "", reasoning: [] })).toBe("");
  });
});

// ---- CACHE_CONTROL & applyCacheControl ----
describe("applyCacheControl", () => {
  it("applies cache control to system message", () => {
    const msgs = [{ role: "system", content: "sys" }, { role: "user", content: "hi" }] as any;
    const result = applyCacheControl(msgs, { t: { description: "tool" } } as any);
    expect(result.messages[0]).toHaveProperty("providerOptions");
  });
  it("applies cache control to last tool", () => {
    const tools = { a: { description: "first" }, b: { description: "last" } } as any;
    const result = applyCacheControl([], tools);
    expect(result.tools.a).not.toHaveProperty("providerOptions");
    expect(result.tools.b).toHaveProperty("providerOptions");
  });
  it("returns tools unchanged when empty", () => {
    expect(applyCacheControl([], {}).tools).toEqual({});
  });
  it("does not modify non-system messages", () => {
    const msgs = [{ role: "user", content: "hi" }] as any;
    const result = applyCacheControl(msgs, {});
    expect(result.messages[0]).toEqual({ role: "user", content: "hi" });
  });
});

// ---- logCacheStats ----
describe("logCacheStats", () => {
  it("does nothing when no anthropic metadata", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logCacheStats(undefined, "test");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("does nothing when both counts are 0", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logCacheStats({ anthropic: { cacheCreationInputTokens: 0, cacheReadInputTokens: 0 } }, "t");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("logs hit when read > 0", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logCacheStats({ anthropic: { cacheCreationInputTokens: 100, cacheReadInputTokens: 50 } }, "ctx");
    expect(spy).toHaveBeenCalledWith("[Jarvis][Cache/ctx] creation=100 read=50 status=hit");
    spy.mockRestore();
  });
  it("logs miss when only creation > 0", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logCacheStats({ anthropic: { cacheCreationInputTokens: 100, cacheReadInputTokens: 0 } }, "ctx");
    expect(spy).toHaveBeenCalledWith("[Jarvis][Cache/ctx] creation=100 read=0 status=miss");
    spy.mockRestore();
  });
});

// ---- streamMessageInConversation ----
describe("streamMessageInConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCredentials["mimo"] = "test-key";
  });

  it("saves user message and returns AI result", async () => {
    (streamText as ReturnType<typeof vi.fn>).mockReturnValue({
      fullStream: (async function* () { yield { type: "text-delta", text: "hi" }; })(),
    });
    const result = await streamMessageInConversation("conv-1", "hi");
    expect(result.isAi).toBe(true);
    expect(result.userMessage).toBeDefined();
    expect(recordActivity).toHaveBeenCalled();
  });

  it("returns non-AI when not configured", async () => {
    Object.keys(mockCredentials).forEach((k) => delete mockCredentials[k]);
    const result = await streamMessageInConversation("conv-1", "hello");
    expect(result.isAi).toBe(false);
    expect(result.reply).toBeDefined();
  });

  it("wraps streamText errors", async () => {
    (streamText as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error("fail"); });
    await expect(streamMessageInConversation("conv-1", "hi")).rejects.toThrow();
  });

  it("auto-generates title from first message", async () => {
    (streamText as ReturnType<typeof vi.fn>).mockReturnValue({
      fullStream: (async function* () {})(),
    });
    await streamMessageInConversation("conv-1", "What tasks do I have?");
    expect(getRepositories().conversations.update).toHaveBeenCalledWith(
      "conv-1", expect.objectContaining({ title: expect.stringContaining("What tasks") }),
    );
  });

  it("does not update title when already custom", async () => {
    vi.mocked(getRepositories().conversations.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "conv-1", title: "Custom", messageCount: 5, modelUsed: "mimo-2.5-pro",
    });
    (streamText as ReturnType<typeof vi.fn>).mockReturnValue({
      fullStream: (async function* () {})(),
    });
    await streamMessageInConversation("conv-1", "hi");
    const calls = (getRepositories().conversations.update as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.find((c: unknown[]) => c[1] && "title" in (c[1] as Record<string, unknown>))).toBeUndefined();
  });

  it("builds memory scope from projectId", async () => {
    vi.mocked(getRepositories().conversations.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "conv-1", title: "New Chat", messageCount: 0, modelUsed: "m", projectId: "p1",
    });
    (streamText as ReturnType<typeof vi.fn>).mockReturnValue({ fullStream: (async function* () {})() });
    await streamMessageInConversation("conv-1", "hi");
    expect(streamText).toHaveBeenCalled();
  });

  it("builds memory scope from workspaceId", async () => {
    vi.mocked(getRepositories().conversations.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "conv-1", title: "New Chat", messageCount: 0, modelUsed: "m", workspaceId: "w1",
    });
    (streamText as ReturnType<typeof vi.fn>).mockReturnValue({ fullStream: (async function* () {})() });
    await streamMessageInConversation("conv-1", "hi");
    expect(streamText).toHaveBeenCalled();
  });

  it("updates model when changed", async () => {
    (streamText as ReturnType<typeof vi.fn>).mockReturnValue({ fullStream: (async function* () {})() });
    vi.mocked(configManager.getActiveModel).mockReturnValue("new-model");
    await streamMessageInConversation("conv-1", "hi");
    expect(getRepositories().conversations.update).toHaveBeenCalledWith(
      "conv-1", expect.objectContaining({ modelUsed: "new-model" }),
    );
    vi.mocked(configManager.getActiveModel).mockReturnValue("auto");
  });

  it("does not throw on model update failure", async () => {
    vi.mocked(getRepositories().conversations.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "conv-1", title: "Custom Title", messageCount: 5, modelUsed: "old-model",
    });
    (getRepositories().conversations.update as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("db"));
    (streamText as ReturnType<typeof vi.fn>).mockReturnValue({ fullStream: (async function* () {})() });
    vi.mocked(configManager.getActiveModel).mockReturnValue("new-model");
    const r = await streamMessageInConversation("conv-1", "hi");
    expect(r.isAi).toBe(true);
    vi.mocked(configManager.getActiveModel).mockReturnValue("auto");
  });

  it("saveAssistantMessage persists with toolCalls", async () => {
    (streamText as ReturnType<typeof vi.fn>).mockReturnValue({ fullStream: (async function* () {})() });
    const r = await streamMessageInConversation("conv-1", "hi");
    await r.saveAssistantMessage("reply", [{ name: "s", args: {}, result: "d" }]);
    expect(getRepositories().conversations.addMessage).toHaveBeenCalledWith(
      "conv-1", expect.objectContaining({ role: "assistant", toolCalls: expect.any(String) }),
    );
  });

  it("saveAssistantMessage omits toolCalls when empty", async () => {
    (streamText as ReturnType<typeof vi.fn>).mockReturnValue({ fullStream: (async function* () {})() });
    const r = await streamMessageInConversation("conv-1", "hi");
    await r.saveAssistantMessage("reply", []);
    expect(getRepositories().conversations.addMessage).toHaveBeenCalledWith(
      "conv-1", expect.objectContaining({ role: "assistant", toolCalls: undefined }),
    );
  });

  it("needsForceAnswer is false by default", async () => {
    (streamText as ReturnType<typeof vi.fn>).mockReturnValue({
      fullStream: (async function* () { yield { type: "text-delta", text: "ok" }; })(),
    });
    const r = await streamMessageInConversation("conv-1", "hi");
    expect(r.needsForceAnswer).toBeFalsy();
    expect(r.forceAnswerFollowUp).toBeUndefined();
  });

  it("handles local fallback for today tasks", async () => {
    Object.keys(mockCredentials).forEach((k) => delete mockCredentials[k]);
    const r = await streamMessageInConversation("conv-1", "今天有什么任务");
    expect(r.isAi).toBe(false);
  });

  it("handles local fallback for help", async () => {
    Object.keys(mockCredentials).forEach((k) => delete mockCredentials[k]);
    const r = await streamMessageInConversation("conv-1", "帮助");
    expect(r.reply).toContain("Jarvis");
  });

  it("handles local fallback for unknown message", async () => {
    Object.keys(mockCredentials).forEach((k) => delete mockCredentials[k]);
    const r = await streamMessageInConversation("conv-1", "random question");
    expect(r.reply).toContain("本地模式");
  });
});

// ---- handleMessageInConversation ----
describe("handleMessageInConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCredentials["mimo"] = "test-key";
  });

  it("consumes stream and returns messages", async () => {
    (streamText as ReturnType<typeof vi.fn>).mockReturnValue({
      fullStream: (async function* () {
        yield { type: "text-delta", text: "Hello " };
        yield { type: "text-delta", text: "world" };
      })(),
    });
    const r = await handleMessageInConversation("conv-1", "hi");
    expect(r.assistantMessage).toBeDefined();
    expect(r.userMessage).toBeDefined();
  });

  it("handles non-AI local fallback", async () => {
    Object.keys(mockCredentials).forEach((k) => delete mockCredentials[k]);
    const r = await handleMessageInConversation("conv-1", "hello");
    expect(r.assistantMessage).toBeDefined();
  });

  it("handles stream with no text deltas", async () => {
    (streamText as ReturnType<typeof vi.fn>).mockReturnValue({
      fullStream: (async function* () { yield { type: "tool-call", toolName: "s" }; })(),
    });
    const r = await handleMessageInConversation("conv-1", "search");
    expect(r.assistantMessage).toBeDefined();
  });
});

// ---- streamChat ----
describe("streamChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCredentials["mimo"] = "test-key";
  });

  it("returns stream with abort controller", async () => {
    const fake = { fullStream: (async function* () {})() };
    (streamText as ReturnType<typeof vi.fn>).mockReturnValue(fake);
    const r = await streamChat([{ role: "user", content: "hi" }]);
    expect(r.stream).toBe(fake);
    expect(r.abortController).toBeInstanceOf(AbortController);
  });

  it("wraps errors with classified code", async () => {
    (streamText as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error("e"); });
    await expect(streamChat([{ role: "user", content: "hi" }])).rejects.toThrow();
  });

  it("passes conversationId", async () => {
    (streamText as ReturnType<typeof vi.fn>).mockReturnValue({ fullStream: (async function* () {})() });
    const r = await streamChat([{ role: "user", content: "hi" }], "text", "conv-1");
    expect(r.selectedModel).toBeDefined();
  });

  it("passes runtime context", async () => {
    (streamText as ReturnType<typeof vi.fn>).mockReturnValue({ fullStream: (async function* () {})() });
    const r = await streamChat([{ role: "user", content: "hi" }], "text", undefined, undefined, undefined, { runId: "r1" });
    expect(r.selectedModel).toBeDefined();
  });

  it("passes provided abortController", async () => {
    (streamText as ReturnType<typeof vi.fn>).mockReturnValue({ fullStream: (async function* () {})() });
    const ctrl = new AbortController();
    const r = await streamChat([{ role: "user", content: "hi" }], "text", undefined, undefined, ctrl);
    expect(r.abortController).toBe(ctrl);
  });

  it("wires onToolEvent", async () => {
    (streamText as ReturnType<typeof vi.fn>).mockReturnValue({ fullStream: (async function* () {})() });
    await streamChat([{ role: "user", content: "hi" }], "text", undefined, vi.fn());
    expect(streamText).toHaveBeenCalled();
  });
});

// ---- handleMessage (legacy) ----
describe("handleMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCredentials["mimo"] = "test-key";
  });

  it("returns local result when AI not configured", async () => {
    Object.keys(mockCredentials).forEach((k) => delete mockCredentials[k]);
    const r = await handleMessage("hello");
    expect(r.reply).toBeDefined();
  });

  it("returns AI result when configured", async () => {
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: "AI reply", steps: [], providerMetadata: undefined,
    });
    const r = await handleMessage("hi");
    expect(r.reply).toBe("AI reply");
  });

  it("collects tool calls from steps", async () => {
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: "done",
      steps: [{
        text: "",
        toolCalls: [{ toolName: "search", input: { q: "t" }, toolCallId: "tc1" }],
        toolResults: [{ toolCallId: "tc1", output: "result" }],
      }],
      providerMetadata: undefined,
    });
    const r = await handleMessage("search");
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0].name).toBe("search");
    expect(r.toolCalls[0].result).toBe("result");
  });

  it("handles steps with no tool results", async () => {
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: "done",
      steps: [{
        text: "",
        toolCalls: [{ toolName: "fn", input: {}, toolCallId: "tc1" }],
        toolResults: [],
      }],
      providerMetadata: undefined,
    });
    const r = await handleMessage("do");
    expect(r.toolCalls[0].result).toBeNull();
  });

  it("propagates generateText errors", async () => {
    (generateText as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("gen error"));
    await expect(handleMessage("hi")).rejects.toThrow("gen error");
  });

  it("uses guardEmptyResponse fallback", async () => {
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: "", reasoning: "thinking...", steps: [], providerMetadata: undefined,
    });
    const r = await handleMessage("think");
    expect(r.reply).toBe("thinking...");
  });

  it("triggers force answer on tool-only rounds", async () => {
    let callCount = 0;
    (generateText as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          text: "",
          steps: [
            { text: "", toolCalls: [{ toolName: "a", input: {}, toolCallId: "t1" }], toolResults: [] },
            { text: "", toolCalls: [{ toolName: "b", input: {}, toolCallId: "t2" }], toolResults: [] },
            { text: "", toolCalls: [{ toolName: "c", input: {}, toolCallId: "t3" }], toolResults: [] },
          ],
          providerMetadata: undefined,
        };
      }
      return { text: "forced answer", steps: [], providerMetadata: undefined };
    });
    const r = await handleMessage("complex");
    expect(r.reply).toBe("forced answer");
  });
});

// ---- handleLocally via streamMessageInConversation ----
describe("handleLocally", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockCredentials).forEach((k) => delete mockCredentials[k]);
  });

  const cases: [string, string][] = [
    ["today tasks", "今天有什么任务"],
    ["all tasks", "查看所有任务"],
    ["reading list", "阅读清单"],
    ["daily summary", "今日总结"],
    ["weekly stats", "本周统计"],
    ["create task", "创建任务写周报"],
    ["add article", "添加文章如何阅读一本书"],
    ["recommend", "推荐下一篇"],
    ["help", "能做什么"],
    ["unknown", "random question"],
  ];

  it.each(cases)("handles %s query", async (_label, msg) => {
    const r = await streamMessageInConversation("conv-1", msg);
    expect(r.isAi).toBe(false);
    expect(r.reply).toBeDefined();
  });
});
