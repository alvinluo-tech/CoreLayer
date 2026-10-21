import { describe, it, expect, vi } from "vitest";
import { adjudicateAttempt } from "../adjudication-service.js";

describe("adjudicateAttempt", () => {
  const sampleInput = {
    taskObjective: "Fix calculation overflow in math utils",
    gitDiff: "diff --git a/math.ts b/math.ts\n+ return BigInt(a) + BigInt(b);",
    changedFiles: ["src/math.ts"],
    testCommandOutput: "✓ all tests pass",
  };

  it("rejects immediately without calling LLM if task objective is missing", async () => {
    const generateSpy = vi.fn();
    const verdict = await adjudicateAttempt(
      { taskObjective: "", gitDiff: "some diff" },
      { generateText: generateSpy as never, getModel: vi.fn() },
    );

    expect(verdict.decision).toBe("REJECT_WITH_FEEDBACK");
    expect(verdict.summary).toContain("Missing task objective");
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it("rejects immediately without calling LLM if git diff is empty", async () => {
    const generateSpy = vi.fn();
    const verdict = await adjudicateAttempt(
      { taskObjective: "Do something", gitDiff: "   " },
      { generateText: generateSpy as never, getModel: vi.fn() },
    );

    expect(verdict.decision).toBe("REJECT_WITH_FEEDBACK");
    expect(verdict.summary).toContain("Empty git diff");
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it("calls generateText and returns parsed APPROVE verdict", async () => {
    const mockModel = { id: "test-model" };
    const mockResponseText = JSON.stringify({
      decision: "APPROVE",
      confidence: 0.98,
      summary: "Overflow issue resolved using BigInt safely",
      critique: "The change uses BigInt and maintains full test coverage.",
      issues: [],
      testsIntegrityVerdict: "clean",
    });

    const generateSpy = vi.fn(async ({ prompt }) => {
      expect(prompt).toContain("Fix calculation overflow in math utils");
      expect(prompt).toContain("+ return BigInt(a) + BigInt(b);");
      return { text: mockResponseText };
    });

    const verdict = await adjudicateAttempt(sampleInput, {
      generateText: generateSpy as never,
      getModel: vi.fn(() => mockModel),
    });

    expect(generateSpy).toHaveBeenCalledTimes(1);
    expect(verdict.decision).toBe("APPROVE");
    expect(verdict.confidence).toBe(0.98);
    expect(verdict.testsIntegrityVerdict).toBe("clean");
  });

  it("handles REJECT_WITH_FEEDBACK verdict from LLM", async () => {
    const mockResponseText = JSON.stringify({
      decision: "REJECT_WITH_FEEDBACK",
      confidence: 0.9,
      summary: "Ignored negative inputs in BigInt calculation",
      critique: "No boundary check for negative numbers was implemented.",
      issues: [{ severity: "warning", description: "Missing negative test" }],
      testsIntegrityVerdict: "suspicious",
    });

    const verdict = await adjudicateAttempt(sampleInput, {
      generateText: vi.fn(async () => ({ text: mockResponseText })) as never,
      getModel: vi.fn(),
    });

    expect(verdict.decision).toBe("REJECT_WITH_FEEDBACK");
    expect(verdict.issues).toHaveLength(1);
    expect(verdict.testsIntegrityVerdict).toBe("suspicious");
  });

  it("safely catches LLM network errors and returns a structured rejection", async () => {
    const verdict = await adjudicateAttempt(sampleInput, {
      generateText: vi.fn(async () => {
        throw new Error("Connection timed out to DeepSeek gateway");
      }) as never,
      getModel: vi.fn(),
    });

    expect(verdict.decision).toBe("REJECT_WITH_FEEDBACK");
    expect(verdict.confidence).toBe(0.0);
    expect(verdict.summary).toContain("Connection timed out to DeepSeek gateway");
    expect(verdict.issues[0].severity).toBe("critical");
  });
});
