import { describe, it, expect } from "vitest";
import { IterationBudget, injectBudgetWarning, guardEmptyResponse, ForceAnswerDetector } from "../application/conversation.js";
import { trimToolResult } from "../../tool/public-api.js";

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
