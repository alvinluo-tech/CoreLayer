import { describe, it, expect, vi, beforeEach } from "vitest";
import { IterationBudget, injectBudgetWarning, guardEmptyResponse, ForceAnswerDetector } from "../application/conversation.js";
import { trimToolResult } from "../../tool/public-api.js";
import { MessageQueue, runAgentLoop } from "../application/agent-loop.js";
import type { AgentLoopConfig } from "../application/agent-loop.js";

// ---- IterationBudget ----

describe("IterationBudget", () => {
  it("should calculate 80% threshold from maxSteps", () => {
    const budget = new IterationBudget(20);
    // threshold = floor(20 * 0.8) = 16
    // advance 15 times — no warning
    for (let i = 0; i < 15; i++) expect(budget.advance()).toBe(false);
    // 16th advance triggers warning
    expect(budget.advance()).toBe(true);
  });

  it("should only inject warning once", () => {
    const budget = new IterationBudget(10);
    // threshold = floor(10 * 0.8) = 8
    for (let i = 0; i < 7; i++) budget.advance();
    expect(budget.advance()).toBe(true);  // 8th — first warning
    expect(budget.advance()).toBe(false); // 9th — no repeat
    expect(budget.advance()).toBe(false); // 10th — no repeat
  });

  it("should track step count accurately", () => {
    const budget = new IterationBudget(5);
    expect(budget.step).toBe(0);
    budget.advance();
    expect(budget.step).toBe(1);
    budget.advance();
    expect(budget.step).toBe(2);
  });

  it("should handle maxSteps=1 (threshold=0, warns immediately)", () => {
    const budget = new IterationBudget(1);
    // threshold = floor(1 * 0.8) = 0
    expect(budget.advance()).toBe(true);
  });

  it("should handle maxSteps=5 (threshold=4)", () => {
    const budget = new IterationBudget(5);
    for (let i = 0; i < 3; i++) expect(budget.advance()).toBe(false);
    expect(budget.advance()).toBe(true); // 4th
    expect(budget.advance()).toBe(false); // 5th
  });

  it("shouldWarn should be false before threshold", () => {
    const budget = new IterationBudget(10);
    expect(budget.shouldWarn).toBe(false);
    budget.advance();
    expect(budget.shouldWarn).toBe(false);
  });

  it("shouldWarn should be true after threshold reached", () => {
    const budget = new IterationBudget(10);
    for (let i = 0; i < 8; i++) budget.advance();
    expect(budget.shouldWarn).toBe(true);
  });
});

// ---- injectBudgetWarning ----

describe("injectBudgetWarning", () => {
  it("should inject warning into first tool result (output field)", () => {
    const results = [
      { toolCallId: "tc1", toolName: "t1", output: "original data" },
      { toolCallId: "tc2", toolName: "t2", output: "other data" },
    ];
    const warned = injectBudgetWarning(results);

    expect(warned).toHaveLength(2);
    expect(warned[0].output).toContain("请整合已有信息并尽快结束回答");
    expect(warned[0].output).toContain("original data");
    // Second result unchanged
    expect(warned[1].output).toBe("other data");
  });

  it("should inject warning into first tool result (result field)", () => {
    const results = [
      { toolCallId: "tc1", toolName: "t1", result: "original data" },
    ];
    const warned = injectBudgetWarning(results);

    expect(warned[0].result).toContain("请整合已有信息并尽快结束回答");
    expect(warned[0].result).toContain("original data");
  });

  it("should return empty array unchanged", () => {
    expect(injectBudgetWarning([])).toEqual([]);
  });

  it("should not mutate the original array", () => {
    const results = [
      { toolCallId: "tc1", toolName: "t1", output: "data" },
    ];
    const warned = injectBudgetWarning(results);
    expect(results[0].output).toBe("data");
    expect(warned[0].output).not.toBe("data");
  });
});

// ---- guardEmptyResponse ----

describe("guardEmptyResponse", () => {
  it("should return text when non-empty", () => {
    expect(guardEmptyResponse({ text: "hello" })).toBe("hello");
  });

  it("should return text when non-empty even if reasoning exists", () => {
    expect(guardEmptyResponse({ text: "answer", reasoning: "thinking..." })).toBe("answer");
  });

  it("should fall back to string reasoning when text is empty", () => {
    expect(guardEmptyResponse({ text: "", reasoning: "deep thought" })).toBe("deep thought");
  });

  it("should fall back to string reasoning when text is whitespace", () => {
    expect(guardEmptyResponse({ text: "   ", reasoning: "deep thought" })).toBe("deep thought");
  });

  it("should fall back to array reasoning when text is empty", () => {
    const result = guardEmptyResponse({
      text: "",
      reasoning: [{ text: "step 1" }, { text: "step 2" }],
    });
    expect(result).toBe("step 1\nstep 2");
  });

  it("should return empty text when no reasoning available", () => {
    expect(guardEmptyResponse({ text: "" })).toBe("");
  });

  it("should return empty text when reasoning is also empty", () => {
    expect(guardEmptyResponse({ text: "", reasoning: "" })).toBe("");
  });

  it("should handle undefined reasoning", () => {
    expect(guardEmptyResponse({ text: "", reasoning: undefined })).toBe("");
  });

  it("should filter out empty text entries in array reasoning", () => {
    const result = guardEmptyResponse({
      text: "",
      reasoning: [{ text: "" }, { text: "only this" }, { text: "" }],
    });
    expect(result).toBe("only this");
  });
});

// ---- trimToolResult ----

describe("trimToolResult", () => {
  it("should return short strings unchanged", () => {
    expect(trimToolResult("short")).toBe("short");
  });

  it("should return short objects unchanged", () => {
    const obj = { key: "value" };
    expect(trimToolResult(obj)).toEqual(obj);
  });

  it("should trim strings longer than 4000 chars", () => {
    const long = "a".repeat(5000);
    const result = trimToolResult(long) as string;
    expect(result.length).toBeLessThan(long.length);
    expect(result).toContain("[结果已截断");
    // Head preserved
    expect(result.startsWith("a".repeat(100))).toBe(true);
    // Tail preserved
    expect(result.endsWith("a".repeat(100))).toBe(true);
  });

  it("should trim objects whose JSON exceeds 4000 chars", () => {
    const bigObj = { data: "x".repeat(5000) };
    const result = trimToolResult(bigObj) as string;
    expect(typeof result).toBe("string");
    expect(result).toContain("[结果已截断");
  });

  it("should not trim objects whose JSON is under 4000 chars", () => {
    const smallObj = { data: "ok" };
    expect(trimToolResult(smallObj)).toEqual(smallObj);
  });

  it("should handle null/undefined gracefully", () => {
    expect(trimToolResult(null)).toBeNull();
    expect(trimToolResult(undefined)).toBeUndefined();
  });

  it("should handle numbers", () => {
    expect(trimToolResult(42)).toBe(42);
  });

  it("result length should not exceed 4000 chars", () => {
    const long = "b".repeat(10000);
    const result = trimToolResult(long) as string;
    expect(result.length).toBeLessThanOrEqual(4000);
  });

  it("should preserve head/tail ratio approximately 70/30", () => {
    const long = "c".repeat(5000);
    const result = trimToolResult(long) as string;
    const notice = "\n\n[结果已截断——过长，已保留首尾摘要]";
    const bodyLen = result.length - notice.length;
    // The result contains head + notice + tail
    // head = floor(bodyBudget * 0.7), tail = bodyBudget - headLen
    const headLen = Math.floor(bodyLen * 0.7);
    // Verify head portion is all 'c'
    const head = result.slice(0, headLen);
    expect(head).toBe("c".repeat(headLen));
  });
});

// ---- ForceAnswerDetector ----

describe("ForceAnswerDetector", () => {
  it("starts with count 0", () => {
    const detector = new ForceAnswerDetector();
    expect(detector.count).toBe(0);
  });

  it("does not trigger on tool-only rounds below threshold", () => {
    const detector = new ForceAnswerDetector();
    expect(detector.recordStep({ toolCalls: [{ name: "t1" }], text: "" })).toBe(false);
    expect(detector.recordStep({ toolCalls: [{ name: "t2" }], text: "" })).toBe(false);
    expect(detector.count).toBe(2);
  });

  it("triggers after 3 consecutive tool-only rounds", () => {
    const detector = new ForceAnswerDetector();
    expect(detector.recordStep({ toolCalls: [{ name: "t1" }], text: "" })).toBe(false);
    expect(detector.recordStep({ toolCalls: [{ name: "t2" }], text: "" })).toBe(false);
    expect(detector.recordStep({ toolCalls: [{ name: "t3" }], text: "" })).toBe(true);
  });

  it("resets counter when a text step appears", () => {
    const detector = new ForceAnswerDetector();
    detector.recordStep({ toolCalls: [{ name: "t1" }], text: "" });
    detector.recordStep({ toolCalls: [{ name: "t2" }], text: "" });
    // Text step resets counter
    detector.recordStep({ text: "Here is my answer", toolCalls: [] });
    expect(detector.count).toBe(0);
    // Need 3 more tool-only rounds to trigger
    expect(detector.recordStep({ toolCalls: [{ name: "t3" }], text: "" })).toBe(false);
    expect(detector.recordStep({ toolCalls: [{ name: "t4" }], text: "" })).toBe(false);
    expect(detector.recordStep({ toolCalls: [{ name: "t5" }], text: "" })).toBe(true);
  });

  it("treats step with only whitespace text as tool-only", () => {
    const detector = new ForceAnswerDetector();
    expect(detector.recordStep({ toolCalls: [{ name: "t1" }], text: "   " })).toBe(false);
    expect(detector.recordStep({ toolCalls: [{ name: "t2" }], text: "   " })).toBe(false);
    expect(detector.recordStep({ toolCalls: [{ name: "t3" }], text: "   " })).toBe(true);
  });

  it("does not trigger on text-only steps", () => {
    const detector = new ForceAnswerDetector();
    expect(detector.recordStep({ text: "answer", toolCalls: [] })).toBe(false);
    expect(detector.count).toBe(0);
  });

  it("does not trigger on empty steps (no tools, no text)", () => {
    const detector = new ForceAnswerDetector();
    expect(detector.recordStep({ text: "", toolCalls: [] })).toBe(false);
    expect(detector.count).toBe(0);
  });

  it("reset clears counter", () => {
    const detector = new ForceAnswerDetector();
    detector.recordStep({ toolCalls: [{ name: "t1" }], text: "" });
    detector.recordStep({ toolCalls: [{ name: "t2" }], text: "" });
    detector.reset();
    expect(detector.count).toBe(0);
    expect(detector.recordStep({ toolCalls: [{ name: "t3" }], text: "" })).toBe(false);
  });

  it("handles step with undefined toolCalls", () => {
    const detector = new ForceAnswerDetector();
    expect(detector.recordStep({ text: "" })).toBe(false);
    expect(detector.count).toBe(0);
  });
});

// ---- MessageQueue ----

describe("MessageQueue", () => {
  it("starts empty", () => {
    const queue = new MessageQueue();
    expect(queue.pending).toBe(false);
    expect(queue.hasSteer).toBe(false);
  });

  it("enqueues a steer message", async () => {
    const queue = new MessageQueue();
    const promise = queue.enqueue("stop that", "steer");
    expect(queue.pending).toBe(true);
    expect(queue.hasSteer).toBe(true);

    const entries = queue.drain("steer");
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe("stop that");
    expect(entries[0].mode).toBe("steer");
    entries[0].resolve();
    await promise;
  });

  it("enqueues a followUp message", async () => {
    const queue = new MessageQueue();
    const promise = queue.enqueue("and another thing", "followUp");
    expect(queue.pending).toBe(true);
    expect(queue.hasSteer).toBe(false);

    const entries = queue.drain("followUp");
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe("and another thing");
    expect(entries[0].mode).toBe("followUp");
    entries[0].resolve();
    await promise;
  });

  it("drain returns all entries and clears the queue", () => {
    const queue = new MessageQueue();
    queue.enqueue("a", "steer");
    queue.enqueue("b", "steer");
    queue.enqueue("c", "followUp");

    const steerEntries = queue.drain("steer");
    expect(steerEntries).toHaveLength(2);
    expect(queue.hasSteer).toBe(false);
    expect(queue.pending).toBe(true); // followUp still pending

    const followUpEntries = queue.drain("followUp");
    expect(followUpEntries).toHaveLength(1);
    expect(queue.pending).toBe(false);
  });

  it("drain resolves promises for consumed entries", async () => {
    const queue = new MessageQueue();
    let resolved = false;
    const promise = queue.enqueue("test", "steer").then(() => {
      resolved = true;
    });

    const entries = queue.drain("steer");
    entries[0].resolve();
    await promise;
    expect(resolved).toBe(true);
  });

  it("onEnqueue callback fires on enqueue", () => {
    const queue = new MessageQueue();
    const callback = vi.fn();
    queue.onEnqueue(callback);

    queue.enqueue("msg1", "steer");
    expect(callback).toHaveBeenCalledWith("steer");

    queue.enqueue("msg2", "followUp");
    expect(callback).toHaveBeenCalledWith("followUp");
  });

  it("separate queues for steer and followUp", () => {
    const queue = new MessageQueue();
    queue.enqueue("steer-1", "steer");
    queue.enqueue("steer-2", "steer");
    queue.enqueue("follow-1", "followUp");

    expect(queue.drain("steer")).toHaveLength(2);
    expect(queue.drain("followUp")).toHaveLength(1);
    expect(queue.drain("steer")).toHaveLength(0);
  });

  it("multiple drains return empty after first drain", () => {
    const queue = new MessageQueue();
    queue.enqueue("msg", "steer");
    queue.drain("steer");
    expect(queue.drain("steer")).toHaveLength(0);
  });
});

// ---- AgentLoop Mocks ----

const mockGenerateText = vi.fn();
vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  stepCountIs: (n: number) => ({ maxSteps: n }),
}));

vi.mock("../../../config/config-manager.js", () => ({
  configManager: {
    getMaxSteps: () => 10,
    getActiveModel: () => "mimo-2.5-pro",
  },
}));

vi.mock("../../../gateways/model/gateway.js", () => ({
  getModelGateway: () => ({
    getModel: vi.fn().mockReturnValue("mock-model"),
  }),
}));

vi.mock("../../../persistence/factory.js", () => ({
  getRepositories: () => ({
    conversations: {
      addMessage: vi.fn().mockResolvedValue({ id: "msg-1" }),
    },
  }),
}));

vi.mock("../../../shared/errors.js", () => ({
  logError: vi.fn(),
}));

// ---- AgentLoop Tests ----

describe("runAgentLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeConfig(overrides?: Partial<AgentLoopConfig>): AgentLoopConfig {
    return {
      conversationId: "conv-1",
      messages: [{ role: "user", content: "hello" }],
      system: "You are a helpful assistant.",
      tools: {},
      queue: new MessageQueue(),
      ...overrides,
    };
  }

  async function collectEvents(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
    const events: unknown[] = [];
    for await (const event of gen) {
      events.push(event);
    }
    return events;
  }

  it("completes in one round when no tool calls", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "Hello! How can I help?",
      toolCalls: [],
      toolResults: [],
      steps: [],
      providerMetadata: {},
    });

    const events = await collectEvents(runAgentLoop(makeConfig()));

    const deltas = events.filter((e: any) => e.type === "delta");
    expect(deltas.length).toBeGreaterThan(0);
    expect((deltas[0] as any).text).toBe("Hello! How can I help?");

    const completed = events.find((e: any) => e.type === "run_completed");
    expect(completed).toBeDefined();
    expect((completed as any).result.text).toBe("Hello! How can I help?");
  });

  it("runs multiple rounds when tools are called", async () => {
    // Round 1: LLM calls a tool
    mockGenerateText.mockResolvedValueOnce({
      text: "",
      toolCalls: [
        {
          toolCallId: "tc-1",
          toolName: "search",
          input: { query: "test" },
        },
      ],
      toolResults: [
        {
          toolCallId: "tc-1",
          toolName: "search",
          output: "search results",
        },
      ],
      steps: [],
      providerMetadata: {},
    });

    // Round 2: LLM responds with text
    mockGenerateText.mockResolvedValueOnce({
      text: "Based on the search results, here's the answer.",
      toolCalls: [],
      toolResults: [],
      steps: [],
      providerMetadata: {},
    });

    const events = await collectEvents(runAgentLoop(makeConfig()));

    // Should have tool_call events
    const toolCalls = events.filter((e: any) => e.type === "tool_call");
    expect(toolCalls.length).toBeGreaterThanOrEqual(2); // call + result

    // Should have completed
    const completed = events.find((e: any) => e.type === "run_completed");
    expect(completed).toBeDefined();
    expect((completed as any).result.text).toContain("search results");
  });

  it("injects steer messages between rounds", async () => {
    const queue = new MessageQueue();

    // Round 1: LLM calls a tool
    mockGenerateText.mockResolvedValueOnce({
      text: "",
      toolCalls: [
        {
          toolCallId: "tc-1",
          toolName: "search",
          input: { query: "old query" },
        },
      ],
      toolResults: [
        {
          toolCallId: "tc-1",
          toolName: "search",
          output: "results",
        },
      ],
      steps: [],
      providerMetadata: {},
    });

    // After steer: LLM responds
    mockGenerateText.mockResolvedValueOnce({
      text: "Adjusted response after steer.",
      toolCalls: [],
      toolResults: [],
      steps: [],
      providerMetadata: {},
    });

    // Enqueue steer — it will be picked up before round 2
    queue.enqueue("use a different approach", "steer");

    await collectEvents(runAgentLoop(makeConfig({ queue })));

    // The steer message should have been injected into the messages
    expect(mockGenerateText).toHaveBeenCalledTimes(2);

    const secondCallMessages = mockGenerateText.mock.calls[1][0].messages;
    const steerMsg = secondCallMessages.find(
      (m: any) =>
        m.role === "user" && m.content?.includes("use a different approach"),
    );
    expect(steerMsg).toBeDefined();
  });

  it("resolves steer promise after drain", async () => {
    const queue = new MessageQueue();
    let steerResolved = false;
    const steerPromise = queue.enqueue("test steer", "steer").then(() => {
      steerResolved = true;
    });

    mockGenerateText.mockResolvedValue({
      text: "done",
      toolCalls: [],
      toolResults: [],
      steps: [],
      providerMetadata: {},
    });

    await collectEvents(runAgentLoop(makeConfig({ queue })));
    await steerPromise;
    expect(steerResolved).toBe(true);
  });

  it("resolves followUp promises after loop completes", async () => {
    const queue = new MessageQueue();
    let followUpResolved = false;
    const followUpPromise = queue.enqueue("follow up msg", "followUp").then(() => {
      followUpResolved = true;
    });

    mockGenerateText.mockResolvedValue({
      text: "done",
      toolCalls: [],
      toolResults: [],
      steps: [],
      providerMetadata: {},
    });

    await collectEvents(runAgentLoop(makeConfig({ queue })));
    await followUpPromise;
    expect(followUpResolved).toBe(true);
  });

  it("emits tool_call events for tool calls and results", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "",
      toolCalls: [
        { toolCallId: "tc-1", toolName: "getWeather", input: { city: "NYC" } },
      ],
      toolResults: [
        { toolCallId: "tc-1", toolName: "getWeather", output: { temp: 72 } },
      ],
      steps: [],
      providerMetadata: {},
    });
    mockGenerateText.mockResolvedValueOnce({
      text: "It's 72 degrees in NYC.",
      toolCalls: [],
      toolResults: [],
      steps: [],
      providerMetadata: {},
    });

    const events = await collectEvents(runAgentLoop(makeConfig()));

    const toolCallEvents = events.filter((e: any) => e.type === "tool_call");
    expect(toolCallEvents.length).toBeGreaterThanOrEqual(2);

    const callEvent = toolCallEvents.find(
      (e: any) => e.toolCall.args !== null,
    ) as any;
    expect(callEvent.toolCall.name).toBe("getWeather");
    expect(callEvent.toolCall.args).toEqual({ city: "NYC" });
  });

  it("calls onTextDelta callback", async () => {
    const onTextDelta = vi.fn();
    mockGenerateText.mockResolvedValueOnce({
      text: "Hello world",
      toolCalls: [],
      toolResults: [],
      steps: [],
      providerMetadata: {},
    });

    await collectEvents(runAgentLoop(makeConfig({ onTextDelta })));
    expect(onTextDelta).toHaveBeenCalledWith("Hello world");
  });

  it("calls onToolEvent callback", async () => {
    const onToolEvent = vi.fn();
    mockGenerateText.mockResolvedValueOnce({
      text: "",
      toolCalls: [
        { toolCallId: "tc-1", toolName: "search", input: { q: "test" } },
      ],
      toolResults: [
        { toolCallId: "tc-1", toolName: "search", output: "found" },
      ],
      steps: [],
      providerMetadata: {},
    });
    mockGenerateText.mockResolvedValueOnce({
      text: "Found it!",
      toolCalls: [],
      toolResults: [],
      steps: [],
      providerMetadata: {},
    });

    await collectEvents(runAgentLoop(makeConfig({ onToolEvent })));

    expect(onToolEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "tool-call", name: "search" }),
    );
    expect(onToolEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "tool-result", name: "search" }),
    );
  });

  it("respects abort signal", async () => {
    const abortController = new AbortController();
    abortController.abort();

    mockGenerateText.mockResolvedValue({
      text: "should not reach",
      toolCalls: [],
      toolResults: [],
      steps: [],
      providerMetadata: {},
    });

    const events = await collectEvents(
      runAgentLoop(makeConfig({ abortSignal: abortController.signal })),
    );

    expect(mockGenerateText).not.toHaveBeenCalled();
    // Should yield run_failed when abort is already set
    const failed = events.find((e: any) => e.type === "run_failed");
    expect(failed).toBeDefined();
  });

  it("handles generateText error", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("LLM unavailable"));

    await expect(
      collectEvents(runAgentLoop(makeConfig())),
    ).rejects.toThrow("LLM unavailable");
  });

  it("detects loop and forces final text response", async () => {
    // Call same tool 3x with same args to trigger LoopBreaker stuck detection
    const toolResponse = {
      text: "",
      toolCalls: [{ toolCallId: "tc-1", toolName: "search", input: { q: "same" } }],
      toolResults: [{ toolCallId: "tc-1", toolName: "search", output: "result" }],
      steps: [],
      providerMetadata: {},
    };
    // Round 1: first call
    mockGenerateText.mockResolvedValueOnce({ ...toolResponse });
    // Round 2: same tool + same args → consecutiveSimilar=1
    mockGenerateText.mockResolvedValueOnce({ ...toolResponse });
    // Round 3: same tool + same args → consecutiveSimilar=2 → stuck=true
    mockGenerateText.mockResolvedValueOnce({ ...toolResponse });
    // Forced text response
    mockGenerateText.mockResolvedValueOnce({
      text: "Based on all the search results...",
      toolCalls: [],
      toolResults: [],
      steps: [],
      providerMetadata: {},
    });

    const events = await collectEvents(runAgentLoop(makeConfig()));

    const completed = events.find((e: any) => e.type === "run_completed");
    expect(completed).toBeDefined();
    expect((completed as any).result.text).toContain("search results");

    // Should have called generateText 3x tool rounds + 1x forced text = 4
    expect(mockGenerateText).toHaveBeenCalledTimes(4);
  });

  it("handles loop-detected forced text error gracefully", async () => {
    // Trigger loop detection
    const toolResponse = {
      text: "",
      toolCalls: [{ toolCallId: "tc-1", toolName: "search", input: { q: "same" } }],
      toolResults: [{ toolCallId: "tc-1", toolName: "search", output: "result" }],
      steps: [],
      providerMetadata: {},
    };
    mockGenerateText.mockResolvedValueOnce({ ...toolResponse });
    mockGenerateText.mockResolvedValueOnce({ ...toolResponse });
    mockGenerateText.mockResolvedValueOnce({ ...toolResponse });
    // Forced text response fails
    mockGenerateText.mockRejectedValueOnce(new Error("LLM timeout"));

    const events = await collectEvents(runAgentLoop(makeConfig()));

    const failed = events.find((e: any) => e.type === "run_failed");
    expect(failed).toBeDefined();
    expect((failed as any).error).toContain("LLM timeout");
  });

  it("exhausts maxRounds and saves with fallback text", async () => {
    // Each round returns tool calls, but maxRounds=2 so loop stops after 2
    mockGenerateText.mockResolvedValue({
      text: "",
      toolCalls: [{ toolCallId: "tc-x", toolName: "search", input: { q: "test" } }],
      toolResults: [{ toolCallId: "tc-x", toolName: "search", output: "result" }],
      steps: [],
      providerMetadata: {},
    });

    const events = await collectEvents(
      runAgentLoop(makeConfig({ maxRounds: 2 })),
    );

    const completed = events.find((e: any) => e.type === "run_completed");
    expect(completed).toBeDefined();
    // Should have tool_call events from both rounds
    const toolCalls = events.filter((e: any) => e.type === "tool_call");
    expect(toolCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("injects budget warning when threshold reached", async () => {
    // maxRounds=3, threshold=floor(3*0.8)=2
    // Round 1: tool call (no warning yet)
    mockGenerateText.mockResolvedValueOnce({
      text: "",
      toolCalls: [{ toolCallId: "tc-1", toolName: "search", input: { q: "a" } }],
      toolResults: [{ toolCallId: "tc-1", toolName: "search", output: "result1" }],
      steps: [],
      providerMetadata: {},
    });
    // Round 2: tool call (threshold reached, warning injected)
    mockGenerateText.mockResolvedValueOnce({
      text: "",
      toolCalls: [{ toolCallId: "tc-2", toolName: "search", input: { q: "b" } }],
      toolResults: [{ toolCallId: "tc-2", toolName: "search", output: "result2" }],
      steps: [],
      providerMetadata: {},
    });
    // Round 3: text response (warning visible in tool results history)
    mockGenerateText.mockResolvedValueOnce({
      text: "Final answer after budget warning.",
      toolCalls: [],
      toolResults: [],
      steps: [],
      providerMetadata: {},
    });

    const events = await collectEvents(runAgentLoop(makeConfig({ maxRounds: 3 })));
    const completed = events.find((e: any) => e.type === "run_completed");
    expect(completed).toBeDefined();
    expect((completed as any).result.text).toContain("budget warning");
  });

  it("mid-loop abort signal stops the loop", async () => {
    const abortController = new AbortController();
    const onToolEvent = vi.fn();

    // Round 1: tool call
    mockGenerateText.mockResolvedValueOnce({
      text: "",
      toolCalls: [{ toolCallId: "tc-1", toolName: "search", input: { q: "test" } }],
      toolResults: [{ toolCallId: "tc-1", toolName: "search", output: "result" }],
      steps: [],
      providerMetadata: {},
    });

    // Abort after first round completes
    onToolEvent.mockImplementationOnce(() => {
      abortController.abort();
    });

    const events = await collectEvents(
      runAgentLoop(makeConfig({ abortSignal: abortController.signal, onToolEvent })),
    );

    // Should have stopped after round 1 and emitted run_failed
    const failed = events.find((e: any) => e.type === "run_failed");
    expect(failed).toBeDefined();
    expect((failed as any).error).toContain("Aborted");
  });
});
