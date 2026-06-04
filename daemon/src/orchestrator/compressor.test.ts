import { describe, it, expect, vi } from "vitest";

// Mock ai module before importing compressor
vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("../ai/provider.js", () => ({
  getModel: vi.fn(() => ({})),
}));

import { sanitizeToolMessages, compressConversation, createSummaryMessage, extractToolSummaries, extractPreferences } from "./compressor.js";
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
      parentMessageId: null,
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

// ---- extractToolSummaries ----

describe("extractToolSummaries", () => {
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
      parentMessageId: null,
      tokenCount: null,
      createdAt: new Date().toISOString(),
    };
  }

  it("extracts tool name and result from call/result pairs", () => {
    const messages = [
      makeMsg("user", "查一下今天有什么任务"),
      makeMsg("assistant", "", {
        toolCalls: JSON.stringify([{ toolCallId: "call-1", toolName: "getTodayTasks" }]),
      }),
      makeMsg("tool", "找到3个待办任务：买菜、写报告、健身", { toolCallId: "call-1" }),
    ];

    const summaries = extractToolSummaries(messages);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].toolName).toBe("getTodayTasks");
    expect(summaries[0].summary).toContain("找到3个待办任务");
  });

  it("extracts multiple tool calls from a single assistant message", () => {
    const messages = [
      makeMsg("assistant", "", {
        toolCalls: JSON.stringify([
          { toolCallId: "c1", toolName: "search_tasks" },
          { toolCallId: "c2", toolName: "getReadingList" },
        ]),
      }),
      makeMsg("tool", "3个任务", { toolCallId: "c1" }),
      makeMsg("tool", "5篇文章", { toolCallId: "c2" }),
    ];

    const summaries = extractToolSummaries(messages);
    expect(summaries).toHaveLength(2);
    expect(summaries[0].toolName).toBe("search_tasks");
    expect(summaries[1].toolName).toBe("getReadingList");
  });

  it("truncates long tool results to 200 chars", () => {
    const longResult = "x".repeat(300);
    const messages = [
      makeMsg("assistant", "", {
        toolCalls: JSON.stringify([{ toolCallId: "c1", toolName: "test" }]),
      }),
      makeMsg("tool", longResult, { toolCallId: "c1" }),
    ];

    const summaries = extractToolSummaries(messages);
    expect(summaries[0].summary.length).toBeLessThanOrEqual(203); // 200 + "..."
    expect(summaries[0].summary).toContain("...");
  });

  it("handles missing tool result gracefully", () => {
    const messages = [
      makeMsg("assistant", "", {
        toolCalls: JSON.stringify([{ toolCallId: "c1", toolName: "test" }]),
      }),
      // No matching tool result
    ];

    const summaries = extractToolSummaries(messages);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].summary).toBe("(no result)");
  });

  it("returns empty array when no tool calls exist", () => {
    const messages = [
      makeMsg("user", "hello"),
      makeMsg("assistant", "hi there"),
    ];

    expect(extractToolSummaries(messages)).toEqual([]);
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
      parentMessageId: null,
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

  it("includes tool summaries in compression prompt when tool calls present", async () => {
    const { generateText } = await import("ai");
    // Mock both calls: summary + preference extraction
    vi.mocked(generateText)
      .mockResolvedValueOnce({
        text: "## 工具调用结果\n- getTodayTasks: 3个任务\n- createTask: 创建了报告任务",
      } as any)
      .mockResolvedValueOnce({
        text: "[]",
      } as any);

    function toolMsg(
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
        parentMessageId: null,
        tokenCount: null,
        createdAt: new Date().toISOString(),
      };
    }

    const messages = [
      toolMsg("user", "今天有什么任务"),
      toolMsg("assistant", "", {
        toolCalls: JSON.stringify([{ toolCallId: "c1", toolName: "getTodayTasks" }]),
      }),
      toolMsg("tool", "找到3个待办任务：买菜、写报告、健身", { toolCallId: "c1" }),
      toolMsg("assistant", "你今天有3个任务"),
      toolMsg("user", "帮我创建一个新任务"),
      toolMsg("assistant", "", {
        toolCalls: JSON.stringify([{ toolCallId: "c2", toolName: "createTask" }]),
      }),
      toolMsg("tool", "已创建任务：完成报告", { toolCallId: "c2" }),
      toolMsg("assistant", "已创建完成报告任务"),
      toolMsg("user", "还有别的吗"),
      toolMsg("assistant", "目前就这些任务"),
    ];

    const result = await compressConversation(messages);

    // The summary should contain tool call results (from the mock)
    expect(result.summary).toContain("getTodayTasks");
    expect(result.summary).toContain("createTask");
    expect(result.compressedMessages.length).toBeGreaterThan(0);
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

// ---- extractPreferences ----

describe("extractPreferences", () => {
  it("extracts preferences from summary text", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValueOnce({
      text: '[{ "key": "coding_style", "value": "用户喜欢函数式编程" }]',
    } as any);

    const prefs = await extractPreferences("用户讨论了编程风格，表示喜欢函数式编程");
    expect(prefs).toHaveLength(1);
    expect(prefs[0].key).toBe("coding_style");
    expect(prefs[0].value).toContain("函数式编程");
  });

  it("returns empty array for empty summary", async () => {
    const prefs = await extractPreferences("");
    expect(prefs).toEqual([]);
  });

  it("returns empty array when LLM finds no preferences", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValueOnce({
      text: "[]",
    } as any);

    const prefs = await extractPreferences("普通对话，没有偏好");
    expect(prefs).toEqual([]);
  });

  it("returns empty array on LLM error", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockRejectedValueOnce(new Error("API error"));

    const prefs = await extractPreferences("some summary");
    expect(prefs).toEqual([]);
  });

  it("caps at 10 preferences", async () => {
    const { generateText } = await import("ai");
    const manyPrefs = Array.from({ length: 15 }, (_, i) => ({
      key: `pref_${i}`,
      value: `偏好 ${i}`,
    }));
    vi.mocked(generateText).mockResolvedValueOnce({
      text: JSON.stringify(manyPrefs),
    } as any);

    const prefs = await extractPreferences("lots of preferences");
    expect(prefs).toHaveLength(10);
  });
});
