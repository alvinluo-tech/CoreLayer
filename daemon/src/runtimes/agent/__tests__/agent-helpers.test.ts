/**
 * Tests for the conversation-loop helper modules that survive the removal of
 * the hand-written agent loop (agent-loop.ts): IterationBudget,
 * injectBudgetWarning, guardEmptyResponse, ForceAnswerDetector,
 * trimToolResult, and the context pruner powering prepareStep.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelMessage } from "ai";
import { IterationBudget, injectBudgetWarning } from "../application/iteration-budget.js";
import { guardEmptyResponse } from "../application/response-guard.js";
import { ForceAnswerDetector } from "../application/force-answer.js";
import { trimToolResult } from "../../tool/public-api.js";
import {
  pruneMessages,
  budgetWarnStep,
  STEP_BUDGET_NOTICE,
  MAX_TURN_CONTEXT_MESSAGES,
} from "../application/context-pruner.js";

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
  let spillRoot: string;
  const prevMode = process.env.JARVIS_RUNTIME_MODE;
  const prevDataDir = process.env.JARVIS_APP_DATA_DIR;

  beforeAll(() => {
    // Spilled output must land in a sandbox, not the real ~/.jarvis.
    spillRoot = mkdtempSync(join(tmpdir(), "jarvis-agent-trim-"));
    process.env.JARVIS_RUNTIME_MODE = "sidecar";
    process.env.JARVIS_APP_DATA_DIR = spillRoot;
  });

  afterAll(() => {
    if (prevMode === undefined) delete process.env.JARVIS_RUNTIME_MODE;
    else process.env.JARVIS_RUNTIME_MODE = prevMode;
    if (prevDataDir === undefined) delete process.env.JARVIS_APP_DATA_DIR;
    else process.env.JARVIS_APP_DATA_DIR = prevDataDir;
    rmSync(spillRoot, { recursive: true, force: true });
  });

  it("should return short strings unchanged", () => {
    expect(trimToolResult("short")).toBe("short");
  });

  it("should return short objects unchanged", () => {
    const obj = { key: "value" };
    expect(trimToolResult(obj)).toEqual(obj);
  });

  it("should spill strings longer than 4000 chars to disk with a handle", () => {
    const long = "a".repeat(5000);
    const result = trimToolResult(long) as string;
    expect(result.startsWith("[Tool Output Spilled]")).toBe(true);
    expect(result).toContain("Total Size: 5000 bytes (5000 characters).");
    // Full content is recoverable from the spilled locator.
    const locator = result.split("Full Content Saved To: ")[1].split("\n")[0].trim();
    expect(readFileSync(locator, "utf8")).toBe(long);
  });

  it("should spill objects whose JSON exceeds 4000 chars", () => {
    const bigObj = { data: "x".repeat(5000) };
    const result = trimToolResult(bigObj) as string;
    expect(typeof result).toBe("string");
    expect(result.startsWith("[Tool Output Spilled]")).toBe(true);
    const locator = result.split("Full Content Saved To: ")[1].split("\n")[0].trim();
    expect(readFileSync(locator, "utf8")).toBe(JSON.stringify(bigObj));
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

  it("should keep a head/tail preview of the spilled content", () => {
    const long = "c".repeat(5000);
    const result = trimToolResult(long) as string;
    // Preview: head 1000 + omitted marker + tail 500 (5000 - 1500 = 3500).
    expect(result).toContain("c".repeat(1000));
    expect(result).toContain("c".repeat(500));
    expect(result).toContain("[3500 characters omitted]");
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

// ---- pruneMessages (prepareStep dynamic pruning) ----

function msg(role: ModelMessage["role"], content: string): ModelMessage {
  return { role, content } as ModelMessage;
}

describe("pruneMessages", () => {
  it("returns the input untouched when within budget", () => {
    const messages = [msg("system", "sys"), msg("user", "hi")];
    const result = pruneMessages(messages, 10);
    expect(result.messages).toBe(messages);
    expect(result.prunedCount).toBe(0);
  });

  it("keeps the leading system message and the most recent tail", () => {
    const messages: ModelMessage[] = [
      msg("system", "sys"),
      ...Array.from({ length: 30 }, (_, i) => msg("user", `m${i}`)),
    ];
    const result = pruneMessages(messages, 10);
    expect(result.messages.length).toBeLessThanOrEqual(10);
    expect(result.messages[0].role).toBe("system");
    // Newest messages survive.
    expect(JSON.stringify(result.messages.at(-1))).toContain("m29");
    expect(result.prunedCount).toBe(messages.length - result.messages.length);
  });

  it("never opens the pruned window with an orphaned tool result", () => {
    const messages: ModelMessage[] = [
      msg("system", "sys"),
      ...Array.from({ length: 20 }, (_, i) => msg("assistant", `a${i}`)),
      { role: "tool", content: [{ type: "tool-result", toolCallId: "t1", toolName: "n", output: "o" }] } as unknown as ModelMessage,
      msg("assistant", "final"),
    ];
    const result = pruneMessages(messages, 5);
    expect(result.messages[0].role).toBe("system");
    expect(result.messages.slice(1).every((m) => m.role !== "tool" || true)).toBe(true);
    // The window head after system must not be a tool message.
    expect(result.messages[1]?.role).not.toBe("tool");
  });

  it("prunes nothing when everything is system messages", () => {
    const messages = Array.from({ length: 5 }, () => msg("system", "s"));
    const result = pruneMessages(messages, 3);
    expect(result.messages.length).toBe(5);
  });

  it("handles empty input", () => {
    const result = pruneMessages([], 5);
    expect(result.messages).toEqual([]);
    expect(result.prunedCount).toBe(0);
  });

  it("defaults to the documented turn window cap", () => {
    expect(MAX_TURN_CONTEXT_MESSAGES).toBe(80);
    const messages = Array.from({ length: 81 }, (_, i) => msg("user", `u${i}`));
    const result = pruneMessages(messages);
    expect(result.prunedCount).toBeGreaterThan(0);
    expect(result.messages.length).toBeLessThanOrEqual(MAX_TURN_CONTEXT_MESSAGES);
  });
});

describe("budgetWarnStep", () => {
  it("computes the 80% threshold with a floor of 1", () => {
    expect(budgetWarnStep(10)).toBe(8);
    expect(budgetWarnStep(20)).toBe(16);
    expect(budgetWarnStep(1)).toBe(1);
    expect(budgetWarnStep(2)).toBe(1);
  });

  it("exposes the wrap-up notice injected by prepareStep", () => {
    expect(STEP_BUDGET_NOTICE).toContain("Approaching maximum step budget");
  });
});
