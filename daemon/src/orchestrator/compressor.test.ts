import { describe, it, expect, vi } from "vitest";

// Mock ai module before importing compressor
vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("../ai/provider.js", () => ({
  getModel: vi.fn(() => ({})),
}));

import { sanitizeToolMessages, compressConversation, createSummaryMessage } from "./compressor.js";
import type { MessageRow } from "../db/repository.js";

// ---- sanitizeToolMessages ----

describe("sanitizeToolMessages", () => {
  function makeMsg(
    role: "user" | "assistant" | "tool",
    content: string,
    opts?: { toolCalls?: string; toolCallId?: string },
  ): MessageRow {
    return {
      id: crypto.randomUUID(),
      conversationId: "conv-1",
      role,
      content,
      toolCalls: opts?.toolCalls ?? null,
      toolCallId: opts?.toolCallId ?? null,
      tokenCount: null,
      createdAt: new Date().toISOString(),
    };
  }

  it("removes orphaned tool messages without preceding tool_calls", () => {
    const messages = [
      makeMsg("user", "hello"),
      makeMsg("tool", "some result", { toolCallId: "call-1" }),
    ];

    const result = sanitizeToolMessages(messages);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
  });

  it("keeps tool messages that have matching tool_calls", () => {
    const messages = [
      makeMsg("user", "hello"),
      makeMsg("assistant", "", {
        toolCalls: JSON.stringify([{ toolCallId: "call-1", toolName: "test" }]),
      }),
      makeMsg("tool", "result", { toolCallId: "call-1" }),
    ];

    const result = sanitizeToolMessages(messages);
    expect(result).toHaveLength(3);
  });

  it("strips tool_calls from assistant when all tool results are removed", () => {
    const messages = [
      makeMsg("assistant", "", {
        toolCalls: JSON.stringify([{ toolCallId: "orphan-call", toolName: "test" }]),
      }),
      // No matching tool result for "orphan-call"
    ];

    const result = sanitizeToolMessages(messages);
    expect(result[0].toolCalls).toBeNull();
  });

  it("preserves valid tool pairs and removes orphaned ones", () => {
    const messages = [
      makeMsg("assistant", "", {
        toolCalls: JSON.stringify([
          { toolCallId: "call-1", toolName: "test1" },
          { toolCallId: "call-2", toolName: "test2" },
        ]),
      }),
      makeMsg("tool", "result-1", { toolCallId: "call-1" }),
      // call-2 has no result — it's orphaned
    ];

    const result = sanitizeToolMessages(messages);
    // Assistant message should keep only call-1
    const assistant = result.find((m) => m.role === "assistant");
    expect(assistant).toBeDefined();
    const calls = JSON.parse(assistant!.toolCalls!);
    expect(calls).toHaveLength(1);
    expect(calls[0].toolCallId).toBe("call-1");
  });

  it("handles messages with invalid JSON in toolCalls", () => {
    const messages = [
      makeMsg("assistant", "", { toolCalls: "invalid-json" }),
    ];

    const result = sanitizeToolMessages(messages);
    // Should not throw, and should strip toolCalls
    expect(result[0].toolCalls).toBeNull();
  });

  it("returns empty array for empty input", () => {
    expect(sanitizeToolMessages([])).toEqual([]);
  });
});

// ---- compressConversation ----

describe("compressConversation", () => {
  function makeMsg(content: string, role: "user" | "assistant" = "user"): MessageRow {
    return {
      id: crypto.randomUUID(),
      conversationId: "conv-1",
      role,
      content,
      toolCalls: null,
      toolCallId: null,
      tokenCount: null,
      createdAt: new Date().toISOString(),
    };
  }

  it("returns empty summary for fewer than 6 messages", async () => {
    const messages = Array.from({ length: 4 }, (_, i) => makeMsg(`msg ${i}`));
    const result = await compressConversation(messages);

    expect(result.summary).toBe("");
    expect(result.compressedMessages).toHaveLength(0);
    expect(result.preservedMessages).toEqual(messages);
  });

  it("calls LLM for summarization with enough messages", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValueOnce({
      text: "## 用户目标\nTest goal\n## 已完成\nTest done",
    } as any);

    const messages = Array.from({ length: 10 }, (_, i) => makeMsg(`msg ${i}`));
    const result = await compressConversation(messages);

    expect(result.summary).toContain("Test goal");
    expect(result.compressedMessages.length).toBeGreaterThan(0);
    expect(result.preservedMessages.length).toBeGreaterThan(0);
  });

  it("preserves recent messages on LLM failure", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockRejectedValueOnce(new Error("API error"));

    const messages = Array.from({ length: 10 }, (_, i) => makeMsg(`msg ${i}`));
    const result = await compressConversation(messages);

    // On failure, all messages are preserved
    expect(result.preservedMessages).toEqual(messages);
    expect(result.compressedMessages).toHaveLength(0);
  });
});

// ---- createSummaryMessage ----

describe("createSummaryMessage", () => {
  it("creates a system message with summary content", () => {
    const result = createSummaryMessage("conv-1", "Test summary", 5);

    expect(result.role).toBe("system");
    expect(result.content).toContain("Test summary");
    expect(result.content).toContain("压缩了 5 条消息");
  });

  it("does not include toolCalls", () => {
    const result = createSummaryMessage("conv-1", "Summary", 3);
    expect(result.toolCalls).toBeUndefined();
  });
});
