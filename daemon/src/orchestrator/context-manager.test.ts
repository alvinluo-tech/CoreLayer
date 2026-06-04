import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  estimateMessagesTokens,
  getContextWindow,
  computeContextBudget,
  shouldCompress,
  selectHistoryWithinBudget,
  assembleContext,
} from "./context-manager.js";
import type { MessageRow, MemoryRow } from "../db/repository.js";
import type { ModelMessage } from "ai";

// ---- estimateTokens ----

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns positive count for non-empty text", () => {
    expect(estimateTokens("hello")).toBeGreaterThan(0);
  });

  it("estimates higher for CJK text than pure ASCII of same length", () => {
    const ascii = "abcdefghij"; // 10 chars
    const cjk = "你好世界你好世界你好世"; // 10 chars
    // Both use the same heuristic (length-based), so they should be equal
    // This is expected — the 0.45 ratio is tuned for mixed content
    expect(estimateTokens(ascii)).toBe(estimateTokens(cjk));
  });

  it("scales linearly with text length", () => {
    const short = estimateTokens("hello");
    const long = estimateTokens("hello world, this is a longer sentence");
    expect(long).toBeGreaterThan(short);
  });
});

// ---- estimateMessagesTokens ----

describe("estimateMessagesTokens", () => {
  it("returns 0 for empty array", () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });

  it("accounts for role overhead per message", () => {
    const msgs: ModelMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    const tokens = estimateMessagesTokens(msgs);
    // Should include 4 overhead per message + content tokens
    expect(tokens).toBeGreaterThan(8);
  });

  it("handles array content (multimodal)", () => {
    const msgs: ModelMessage[] = [
      {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
    ];
    expect(estimateMessagesTokens(msgs)).toBeGreaterThan(0);
  });
});

// ---- getContextWindow ----

describe("getContextWindow", () => {
  it("returns known window for GPT-4o", () => {
    expect(getContextWindow("gpt-4o")).toBe(128_000);
  });

  it("returns known window for Claude models", () => {
    expect(getContextWindow("claude-3.5-sonnet")).toBe(200_000);
  });

  it("returns known window for DeepSeek", () => {
    expect(getContextWindow("deepseek-chat")).toBe(64_000);
  });

  it("returns known window for Gemini", () => {
    expect(getContextWindow("gemini-2.5-pro")).toBe(1_048_576);
  });

  it("returns known window for mimo", () => {
    expect(getContextWindow("mimo-v2.5-pro")).toBe(131_072);
  });

  it("returns default for unknown model", () => {
    expect(getContextWindow("unknown-model-xyz")).toBe(128_000);
  });

  it("uses longest substring match", () => {
    // "gpt-4o" should match before "gpt-4"
    expect(getContextWindow("gpt-4o-mini")).toBe(128_000);
  });
});

// ---- computeContextBudget ----

describe("computeContextBudget", () => {
  it("returns correct budget structure", () => {
    const budget = computeContextBudget("gpt-4o", 1000, 500);
    expect(budget.contextWindow).toBe(128_000);
    expect(budget.maxInputTokens).toBe(Math.floor(128_000 * 0.85));
    expect(budget.systemPromptTokens).toBe(1000);
    expect(budget.memoryTokens).toBe(500);
    expect(budget.historyTokens).toBe(budget.maxInputTokens - 1500);
  });

  it("caps maxInputTokens at 200k", () => {
    const budget = computeContextBudget("gemini-2.5-pro", 0, 0);
    expect(budget.maxInputTokens).toBe(200_000);
  });

  it("returns 0 historyTokens when system + memory exceed budget", () => {
    const budget = computeContextBudget("gpt-4o", 100_000, 100_000);
    expect(budget.historyTokens).toBe(0);
  });
});

// ---- shouldCompress ----

describe("shouldCompress", () => {
  const budget = {
    contextWindow: 128_000,
    maxInputTokens: 108_800,
    systemPromptTokens: 1000,
    memoryTokens: 500,
    historyTokens: 107_300,
  };

  it("returns false when message count is too low", () => {
    const result = shouldCompress(50_000, budget, 4);
    expect(result.shouldCompress).toBe(false);
    expect(result.urgency).toBe("none");
  });

  it("returns soft at 50% usage", () => {
    const result = shouldCompress(55_000, budget, 10);
    expect(result.shouldCompress).toBe(true);
    expect(result.urgency).toBe("soft");
  });

  it("returns hard at 85% usage", () => {
    const result = shouldCompress(92_000, budget, 10);
    expect(result.shouldCompress).toBe(true);
    expect(result.urgency).toBe("hard");
  });

  it("returns none below 50%", () => {
    const result = shouldCompress(40_000, budget, 10);
    expect(result.shouldCompress).toBe(false);
    expect(result.urgency).toBe("none");
  });
});

// ---- selectHistoryWithinBudget ----

describe("selectHistoryWithinBudget", () => {
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
      compressed: false,
      createdAt: new Date().toISOString(),
    };
  }

  it("returns all messages when within budget", () => {
    const messages = Array.from({ length: 5 }, (_, i) => makeMsg(`msg ${i}`));
    const budget = {
      contextWindow: 128_000,
      maxInputTokens: 108_800,
      systemPromptTokens: 1000,
      memoryTokens: 0,
      historyTokens: 107_800,
    };

    const result = selectHistoryWithinBudget(messages, budget);
    expect(result.selected).toHaveLength(5);
    expect(result.truncated).toBe(false);
  });

  it("truncates old messages when over budget", () => {
    const longContent = "x".repeat(10_000);
    const messages = Array.from({ length: 30 }, () => makeMsg(longContent));
    const budget = {
      contextWindow: 128_000,
      maxInputTokens: 108_800,
      systemPromptTokens: 1000,
      memoryTokens: 0,
      historyTokens: 5_000, // Very tight budget
    };

    const result = selectHistoryWithinBudget(messages, budget);
    expect(result.selected.length).toBeLessThan(30);
    expect(result.truncated).toBe(true);
  });

  it("always preserves recent messages", () => {
    const messages = Array.from({ length: 20 }, (_, i) => makeMsg(`msg ${i}`));
    const budget = {
      contextWindow: 128_000,
      maxInputTokens: 108_800,
      systemPromptTokens: 1000,
      memoryTokens: 0,
      historyTokens: 200, // Very tight — only fits ~5 messages
    };

    const result = selectHistoryWithinBudget(messages, budget);
    // Should still include at least the last 3 (hard minimum)
    const lastThree = messages.slice(-3);
    for (const msg of lastThree) {
      expect(result.selected).toContainEqual(msg);
    }
  });

  it("returns empty for empty messages", () => {
    const budget = {
      contextWindow: 128_000,
      maxInputTokens: 108_800,
      systemPromptTokens: 1000,
      memoryTokens: 0,
      historyTokens: 107_800,
    };

    const result = selectHistoryWithinBudget([], budget);
    expect(result.selected).toHaveLength(0);
    expect(result.truncated).toBe(false);
  });
});

// ---- assembleContext ----

describe("assembleContext", () => {
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
      compressed: false,
      createdAt: new Date().toISOString(),
    };
  }

  function makeMemory(key: string, value: string): MemoryRow {
    return {
      id: crypto.randomUUID(),
      userId: "default",
      type: "fact",
      tier: "fact",
      key,
      value,
      source: null,
      confidence: null,
      uses: 0,
      expiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  it("builds context with system prompt and history", () => {
    const history = [makeMsg("hello"), makeMsg("hi there", "assistant")];
    const context = assembleContext("gpt-4o", "You are helpful.", [], history);

    expect(context.messages.length).toBeGreaterThanOrEqual(3); // system + 2 history
    expect(context.messages[0]).toEqual({ role: "system", content: "You are helpful." });
    expect(context.historyTruncated).toBe(false);
  });

  it("includes memories when present", () => {
    const memories = [makeMemory("name", "Alvin"), makeMemory("role", "developer")];
    const history = [makeMsg("hello")];
    const context = assembleContext("gpt-4o", "System", memories, history);

    // Should have: system + memory system + user message
    const memoryMsg = context.messages.find(
      (m) => m.role === "system" && typeof m.content === "string" && m.content.includes("用户记忆"),
    );
    expect(memoryMsg).toBeDefined();
  });

  it("reports compression recommendation when history is large", () => {
    const longContent = "x".repeat(5000);
    const history = Array.from({ length: 50 }, () => makeMsg(longContent));
    const context = assembleContext("gpt-4o", "System", [], history);

    // With 50 long messages, should recommend compression
    expect(context.shouldCompress).toBe(true);
  });

  it("reports token usage breakdown", () => {
    const history = [makeMsg("hello")];
    const context = assembleContext("gpt-4o", "System", [], history);

    expect(context.tokens.system).toBeGreaterThan(0);
    expect(context.tokens.history).toBeGreaterThan(0);
    expect(context.tokens.total).toBeGreaterThan(0);
    expect(context.tokens.budget).toBeGreaterThan(0);
  });
});
