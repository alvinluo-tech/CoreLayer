import { describe, it, expect, vi } from "vitest";
import {
  verifyAdversarialAdjudication,
  runVerification,
} from "../verification.js";
import {
  createAdversarialJudgeQualityGate,
  registerGate,
  runQualityGates,
  resetGates,
} from "../quality-gate.js";
import type { AdjudicationDeps } from "../../../workflow/adjudication/adjudication-service.js";

describe("Adversarial Adjudication in Verification Pipeline", () => {
  const sampleOptions = {
    taskObjective: "Safely parse incoming payload",
    gitDiff: "diff --git a/parser.ts b/parser.ts\n+ if (!input) return null;",
    changedFiles: ["src/parser.ts"],
  };

  function createMockDeps(responseDecision: string = "APPROVE"): Partial<AdjudicationDeps> {
    const jsonText = JSON.stringify({
      decision: responseDecision,
      confidence: 0.95,
      summary: `Judge decision: ${responseDecision}`,
      critique: `Critique for ${responseDecision}`,
      issues: responseDecision === "APPROVE" ? [] : [{ severity: "critical", description: "Weak test" }],
      testsIntegrityVerdict: responseDecision === "APPROVE" ? "clean" : "weakened",
    });

    return {
      generateText: vi.fn(async () => ({ text: jsonText })) as never,
      getModel: vi.fn(() => ({ id: "mock-model" })),
    };
  }

  it("passes immediately without calling LLM when enabled is false", async () => {
    const deps = createMockDeps();
    const result = await verifyAdversarialAdjudication(
      { ...sampleOptions, enabled: false },
      deps,
    );

    expect(result.checkName).toBe("adversarial-judge");
    expect(result.passed).toBe(true);
    expect(result.severity).toBe("info");
    expect(deps.generateText).not.toHaveBeenCalled();
  });

  it("returns passed=true with severity info on APPROVE verdict", async () => {
    const deps = createMockDeps("APPROVE");
    const result = await verifyAdversarialAdjudication(sampleOptions, deps);

    expect(result.checkName).toBe("adversarial-judge");
    expect(result.passed).toBe(true);
    expect(result.severity).toBe("info");
    expect(result.metadata?.decision).toBe("APPROVE");
    expect(result.metadata?.testsIntegrityVerdict).toBe("clean");
  });

  it("returns passed=false with severity critical on REJECT_WITH_FEEDBACK verdict", async () => {
    const deps = createMockDeps("REJECT_WITH_FEEDBACK");
    const result = await verifyAdversarialAdjudication(sampleOptions, deps);

    expect(result.checkName).toBe("adversarial-judge");
    expect(result.passed).toBe(false);
    expect(result.severity).toBe("critical");
    expect(result.metadata?.decision).toBe("REJECT_WITH_FEEDBACK");
    expect(result.metadata?.testsIntegrityVerdict).toBe("weakened");
  });

  it("integrates into runVerification and fails allPassed when judge rejects", async () => {
    const deps = createMockDeps("REJECT_WITH_FEEDBACK");
    const report = await runVerification(
      "run-123",
      {
        changedFiles: ["src/parser.ts"],
        allowedPaths: ["src/**"],
        adjudication: sampleOptions,
      },
      { adjudicationDeps: deps },
    );

    // Path policy passes, but adversarial judge check fails -> allPassed is false
    expect(report.results).toHaveLength(2);
    expect(report.results.find((r) => r.checkName === "path-policy")?.passed).toBe(true);
    expect(report.results.find((r) => r.checkName === "adversarial-judge")?.passed).toBe(false);
    expect(report.allPassed).toBe(false);
  });

  it("integrates into runVerification and passes allPassed when all checks pass", async () => {
    const deps = createMockDeps("APPROVE");
    const report = await runVerification(
      "run-123",
      {
        changedFiles: ["src/parser.ts"],
        allowedPaths: ["src/**"],
        adjudication: sampleOptions,
      },
      { adjudicationDeps: deps },
    );

    expect(report.results).toHaveLength(2);
    expect(report.allPassed).toBe(true);
  });

  it("integrates into quality gate pipeline via createAdversarialJudgeQualityGate", async () => {
    resetGates();
    const gate = createAdversarialJudgeQualityGate({
      required: true,
      taskObjective: "Must be safe",
      diffContent: "diff --git a/a.ts b/a.ts\n+ safeCode();",
    });
    registerGate(gate);

    const context = {
      runId: "run-gate-test",
      taskType: "coding",
      workingDirectory: "/repo",
      changedFiles: ["src/a.ts"],
      artifacts: [{ type: "diff", content: "diff --git a/a.ts b/a.ts\n+ safeCode();" }],
    };

    // Spy on verifyAdversarialAdjudication under the hood
    const results = await runQualityGates(context);
    expect(results).toHaveLength(1);
    expect(results[0].checkName).toBe("adversarial-judge");
    resetGates();
  });
});
