import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecute, mockGetTool } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockGetTool: vi.fn(),
}));

vi.mock("../../index.js", () => ({
  toolRuntime: { execute: (...args: unknown[]) => mockExecute(...args) },
}));

vi.mock("../adapters/native-tools/registry.js", () => ({
  getRegistry: () => ({
    getTool: (name: string) => mockGetTool(name),
  }),
}));

import { wrapToolsForAI, type AIToolRuntimeContext } from "../adapters/ai-tool-wrapper.js";

function makeTool(name: string, hasExecute = true) {
  return {
    description: `Tool ${name}`,
    ...(hasExecute ? { execute: async () => "ok" } : {}),
  } as any;
}

describe("wrapToolsForAI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTool.mockReturnValue({ id: "test-tool", source: "mcp" });
    mockExecute.mockResolvedValue({
      result: { success: true, data: "result-value" },
    });
  });

  it("passes runId and mode to toolRuntime.execute", async () => {
    const ctx: AIToolRuntimeContext = {
      runId: "run-123",
      mode: "chat",
      conversationId: "conv-1",
      projectId: "proj-1",
    };
    const wrapped = wrapToolsForAI({ test: makeTool("test") }, ctx);

    await (wrapped.test as any).execute({ q: "hello" });

    expect(mockExecute).toHaveBeenCalledWith("test-tool", { q: "hello" }, {
      caller: "ai",
      runId: "run-123",
      conversationId: "conv-1",
      projectId: "proj-1",
      mode: "chat",
      toolCallId: expect.stringMatching(/^tc_[a-f0-9]{16}$/),
    });
  });

  it("passes voice mode context to toolRuntime", async () => {
    const ctx: AIToolRuntimeContext = {
      runId: "run-456",
      mode: "voice",
    };
    const wrapped = wrapToolsForAI({ test: makeTool("test") }, ctx);

    await (wrapped.test as any).execute({ q: "test" });

    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ runId: "run-456", mode: "voice" }),
    );
  });

  it("works without context (legacy usage)", async () => {
    const wrapped = wrapToolsForAI({ test: makeTool("test") });

    await (wrapped.test as any).execute({ q: "test" });

    expect(mockExecute).toHaveBeenCalledWith("test-tool", { q: "test" }, {
      caller: "ai",
      runId: undefined,
      conversationId: undefined,
      projectId: undefined,
      mode: undefined,
      toolCallId: undefined,
    });
  });

  it("accepts plain string as conversationId for backward compat", async () => {
    const wrapped = wrapToolsForAI({ test: makeTool("test") }, "conv-backward");

    await (wrapped.test as any).execute({ q: "test" });

    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ conversationId: "conv-backward" }),
    );
  });

  it("returns tool result on success", async () => {
    const wrapped = wrapToolsForAI({ test: makeTool("test") }, { runId: "r1" });
    const result = await (wrapped.test as any).execute({ q: "hi" });
    expect(result).toBe("result-value");
  });

  it("throws on tool execution failure", async () => {
    mockExecute.mockResolvedValue({
      result: { success: false, error: "denied" },
    });
    const wrapped = wrapToolsForAI({ test: makeTool("test") }, { runId: "r1" });

    await expect((wrapped.test as any).execute({ q: "hi" })).rejects.toThrow("denied");
  });

  it("skips tools without execute function", () => {
    const wrapped = wrapToolsForAI(
      { noop: makeTool("noop", false) },
      { runId: "r1" },
    );
    expect(wrapped.noop).toBeInstanceOf(Object);
  });
});
