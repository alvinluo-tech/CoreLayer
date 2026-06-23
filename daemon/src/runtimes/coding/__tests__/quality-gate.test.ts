import { describe, it, expect, beforeEach } from "vitest";
import {
  registerGate,
  getGatesForTaskType,
  runQualityGates,
  allRequiredGatesPass,
  resetGates,
} from "../quality-gate.js";

describe("QualityGate", () => {
  beforeEach(() => {
    resetGates();
  });

  it("should register and retrieve gates", () => {
    registerGate({
      name: "lint",
      taskTypes: ["coding"],
      required: true,
      check: async () => ({ checkName: "lint", passed: true, summary: "OK", severity: "info" }),
    });

    const gates = getGatesForTaskType("coding");
    expect(gates).toHaveLength(1);
    expect(gates[0].name).toBe("lint");
  });

  it("should filter gates by task type", () => {
    registerGate({ name: "lint", taskTypes: ["coding"], required: true, check: async () => ({ checkName: "lint", passed: true, summary: "", severity: "info" }) });
    registerGate({ name: "citation", taskTypes: ["research"], required: true, check: async () => ({ checkName: "citation", passed: true, summary: "", severity: "info" }) });

    expect(getGatesForTaskType("coding")).toHaveLength(1);
    expect(getGatesForTaskType("research")).toHaveLength(1);
  });

  it("should include wildcard gates", () => {
    registerGate({ name: "universal", taskTypes: ["*"], required: false, check: async () => ({ checkName: "universal", passed: true, summary: "", severity: "info" }) });

    expect(getGatesForTaskType("coding")).toHaveLength(1);
    expect(getGatesForTaskType("research")).toHaveLength(1);
  });

  it("should run quality gates", async () => {
    registerGate({
      name: "lint",
      taskTypes: ["coding"],
      required: true,
      check: async () => ({ checkName: "lint", passed: true, summary: "No issues", severity: "info" }),
    });

    const results = await runQualityGates({
      runId: "run-1",
      taskType: "coding",
      workingDirectory: "/tmp",
      changedFiles: [],
      artifacts: [],
    });

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
  });

  it("should check all required gates pass", () => {
    registerGate({ name: "lint", taskTypes: ["coding"], required: true, check: async () => ({ checkName: "lint", passed: true, summary: "", severity: "info" }) });
    registerGate({ name: "typecheck", taskTypes: ["coding"], required: true, check: async () => ({ checkName: "typecheck", passed: true, summary: "", severity: "info" }) });

    const results = [
      { checkName: "lint", passed: true, summary: "", severity: "info" as const },
      { checkName: "typecheck", passed: false, summary: "Errors", severity: "error" as const },
    ];

    expect(allRequiredGatesPass(results, "coding")).toBe(false);
  });
});
