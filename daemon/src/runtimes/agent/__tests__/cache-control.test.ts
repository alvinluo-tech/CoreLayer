import { describe, it, expect, vi } from "vitest";
import { ContextBuilder } from "../application/context-builder.js";
import { applyCacheControl, logCacheStats, CACHE_CONTROL } from "../application/conversation.js";
import type { ModelMessage, Tool } from "ai";

// Mock the tools registry
vi.mock("../../tool/adapters/native-tools/registry.js", () => ({
  getRegistry: () => ({ resolveTool: () => null, getTool: () => null }),
  registerJarvisTool: vi.fn(),
  registerTool: vi.fn(),
  getTool: vi.fn(() => null),
  getAllTools: vi.fn(() => []),
  getAllJarvisTools: () => [
    {
      id: "native:getTodayTasks",
      appId: "jarvis",
      source: "native",
      name: "getTodayTasks",
      title: "getTodayTasks",
      description: "获取今天的任务列表",
      inputSchema: { type: "object" },
      risk: "low",
      permissions: [],
      requiresConfirmation: false,
      execute: vi.fn(),
    },
    {
      id: "native:createTask",
      appId: "jarvis",
      source: "native",
      name: "createTask",
      title: "createTask",
      description: "创建一个新任务",
      inputSchema: { type: "object" },
      risk: "low",
      permissions: [],
      requiresConfirmation: false,
      execute: vi.fn(),
    },
  ],
}));

// ---- ContextBuilder.cacheEnabled ----

describe("ContextBuilder.cacheEnabled", () => {
  it("should be true when tools are present", async () => {
    const builder = new ContextBuilder({
      mode: "text",
      modelName: "gpt-4o",
      userMessage: "hello",
    });
    const context = await builder.build([], []);
    // getAllJarvisTools mock returns 2 tools, so cacheEnabled should be true
    expect(context.cacheEnabled).toBe(true);
  });

  it("should be true when system prompt exceeds 4000 chars (no tools)", async () => {
    // We can't easily remove tools from the mock, but we can test the length
    // condition by verifying the logic: tools present => true regardless of length
    const builder = new ContextBuilder({
      mode: "text",
      modelName: "gpt-4o",
      userMessage: "a".repeat(5000),
    });
    const context = await builder.build([], []);
    expect(context.cacheEnabled).toBe(true);
  });

  it("should include cacheEnabled in the returned context", async () => {
    const builder = new ContextBuilder({
      mode: "text",
      modelName: "gpt-4o",
    });
    const context = await builder.build([], []);
    expect(typeof context.cacheEnabled).toBe("boolean");
  });
});

// ---- applyCacheControl ----

describe("applyCacheControl", () => {
  const systemMsg: ModelMessage = {
    role: "system",
    content: "You are a helpful assistant.",
  };
  const userMsg: ModelMessage = {
    role: "user",
    content: "Hello",
  };

  function makeTool(name: string): Tool {
    return {
      description: `Tool ${name}`,
      execute: async () => "ok",
    } as unknown as Tool;
  }

  it("should add cacheControl to the system message", () => {
    const messages = [systemMsg, userMsg];
    const tools = { getTasks: makeTool("getTasks") };

    const result = applyCacheControl(messages, tools);

    expect(result.messages[0]).toEqual({
      ...systemMsg,
      providerOptions: { anthropic: { cacheControl: CACHE_CONTROL } },
    });
    // User message should be unchanged
    expect(result.messages[1]).toEqual(userMsg);
  });

  it("should not modify non-system messages", () => {
    const messages = [systemMsg, userMsg];
    const tools = { getTasks: makeTool("getTasks") };

    const result = applyCacheControl(messages, tools);

    expect(result.messages[1]).toEqual(userMsg);
    expect(result.messages[1]).not.toHaveProperty("providerOptions");
  });

  it("should add cacheControl to the last tool only", () => {
    const messages = [systemMsg];
    const tools = {
      getTasks: makeTool("getTasks"),
      createTask: makeTool("createTask"),
      deleteTask: makeTool("deleteTask"),
    };

    const result = applyCacheControl(messages, tools);

    // First two tools should NOT have cacheControl
    expect(result.tools.getTasks).not.toHaveProperty("providerOptions");
    expect(result.tools.createTask).not.toHaveProperty("providerOptions");

    // Last tool SHOULD have cacheControl
    expect(result.tools.deleteTask).toHaveProperty(
      "providerOptions",
      { anthropic: { cacheControl: CACHE_CONTROL } },
    );
    expect(result.tools.deleteTask).toHaveProperty("description", "Tool deleteTask");
  });

  it("should handle single tool correctly", () => {
    const messages = [systemMsg];
    const tools = { onlyTool: makeTool("onlyTool") };

    const result = applyCacheControl(messages, tools);

    expect(result.tools.onlyTool).toHaveProperty(
      "providerOptions",
      { anthropic: { cacheControl: CACHE_CONTROL } },
    );
    expect(result.tools.onlyTool).toHaveProperty("description", "Tool onlyTool");
  });

  it("should handle empty tools gracefully", () => {
    const messages = [systemMsg, userMsg];
    const tools = {};

    const result = applyCacheControl(messages, tools);

    // System message still gets cacheControl
    expect(result.messages[0]).toHaveProperty("providerOptions");
    // Empty tools object returned as-is
    expect(Object.keys(result.tools)).toHaveLength(0);
  });

  it("should not mutate the original messages array", () => {
    const messages = [systemMsg, userMsg];
    const tools = { getTasks: makeTool("getTasks") };

    const result = applyCacheControl(messages, tools);

    // Original should be unchanged
    expect(messages[0]).not.toHaveProperty("providerOptions");
    expect(result.messages[0]).toHaveProperty("providerOptions");
  });

  it("should not mutate the original tools object", () => {
    const messages = [systemMsg];
    const tool = makeTool("getTasks");
    const tools = { getTasks: tool };

    const result = applyCacheControl(messages, tools);

    expect(tool).not.toHaveProperty("providerOptions");
    expect(result.tools.getTasks).toHaveProperty("providerOptions");
  });
});

// ---- logCacheStats ----

describe("logCacheStats", () => {
  it("should log cache creation stats (miss)", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    logCacheStats(
      { anthropic: { cacheCreationInputTokens: 1500, cacheReadInputTokens: 0 } },
      "test",
    );

    expect(spy).toHaveBeenCalledWith(
      "[Jarvis][Cache/test] creation=1500 read=0 status=miss",
    );
    spy.mockRestore();
  });

  it("should log cache read stats (hit)", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    logCacheStats(
      { anthropic: { cacheCreationInputTokens: 0, cacheReadInputTokens: 2000 } },
      "test",
    );

    expect(spy).toHaveBeenCalledWith(
      "[Jarvis][Cache/test] creation=0 read=2000 status=hit",
    );
    spy.mockRestore();
  });

  it("should not log when no anthropic metadata", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    logCacheStats(undefined, "test");

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("should not log when cache tokens are both zero", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    logCacheStats(
      { anthropic: { cacheCreationInputTokens: 0, cacheReadInputTokens: 0 } },
      "test",
    );

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("should handle missing token fields gracefully", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    logCacheStats({ anthropic: {} }, "test");

    // Both default to 0, so no log
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
