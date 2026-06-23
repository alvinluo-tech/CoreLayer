import { describe, it, expect } from "vitest";
import { evaluateDeliveryGate, confirmDelivery } from "../delivery-gate.js";
import type { VerificationReport } from "../verification.js";

function createReport(allPassed: boolean): VerificationReport {
  return {
    runId: "run-1",
    allPassed,
    results: [
      {
        checkName: "path-policy",
        passed: allPassed,
        summary: allPassed ? "OK" : "Failed",
        severity: allPassed ? "info" : "error",
      },
    ],
    verifiedAt: new Date().toISOString(),
    totalDurationMs: 100,
  };
}

describe("evaluateDeliveryGate", () => {
  it("should allow delivery when verification passes", () => {
    const decision = evaluateDeliveryGate(createReport(true));
    expect(decision.allowed).toBe(true);
    expect(decision.state).toBe("delivery_ready");
  });

  it("should block delivery when verification fails", () => {
    const decision = evaluateDeliveryGate(createReport(false));
    expect(decision.allowed).toBe(false);
    expect(decision.state).toBe("rejected");
  });

  it("require confirmation for external actions", () => {
    const decision = evaluateDeliveryGate(createReport(true), ["git push", "npm publish"]);
    expect(decision.allowed).toBe(false);
    expect(decision.requiresConfirmation).toBe(true);
    expect(decision.pendingExternalActions).toEqual(["git push", "npm publish"]);
  });
});

describe("confirmDelivery", () => {
  it("should confirm awaiting delivery", () => {
    const decision = evaluateDeliveryGate(createReport(true), ["git push"]);
    const confirmed = confirmDelivery(decision);
    expect(confirmed.allowed).toBe(true);
    expect(confirmed.state).toBe("delivered");
  });

  it("should not change non-awaiting decision", () => {
    const decision = evaluateDeliveryGate(createReport(true));
    const result = confirmDelivery(decision);
    expect(result.state).toBe("delivery_ready");
  });
});
