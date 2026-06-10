import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./executor.js", () => ({
  executeSkill: vi.fn(),
}));

vi.mock("./loader.js", () => ({
  getSkill: vi.fn(),
}));

import { executeWorkflow, validateWorkflow } from "./workflow.js";
import { executeSkill } from "./executor.js";
import { getSkill } from "./loader.js";

const mockExecuteSkill = vi.mocked(executeSkill);
const mockGetSkill = vi.mocked(getSkill);

function makeStepResult(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    skillName: "test",
    steps: [],
    output: { done: true },
    durationMs: 10,
    ...overrides,
  };
}

describe("executeWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should execute a single-step workflow", async () => {
    mockExecuteSkill.mockResolvedValue(makeStepResult({ output: "result-1" }));

    const result = await executeWorkflow({
      name: "test-workflow",
      description: "test",
      steps: [{ skill: "skill-a" }],
    });

    expect(result.success).toBe(true);
    expect(result.workflowName).toBe("test-workflow");
    expect(result.stepResults).toHaveLength(1);
    expect(result.finalOutput).toEqual("result-1");
    expect(mockExecuteSkill).toHaveBeenCalledWith("skill-a", {});
  });

  it("should execute multi-step workflow sequentially", async () => {
    mockExecuteSkill
      .mockResolvedValueOnce(makeStepResult({ output: "out-1" }))
      .mockResolvedValueOnce(makeStepResult({ output: "out-2" }));

    const result = await executeWorkflow({
      name: "multi",
      description: "test",
      steps: [
        { skill: "skill-a" },
        { skill: "skill-b" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.stepResults).toHaveLength(2);
    expect(result.finalOutput).toEqual("out-2");
  });

  it("should stop on first failure", async () => {
    mockExecuteSkill
      .mockResolvedValueOnce(makeStepResult({ success: false, error: "fail", output: null }))
      .mockResolvedValueOnce(makeStepResult({ output: "never" }));

    const result = await executeWorkflow({
      name: "fail-wf",
      description: "test",
      steps: [
        { skill: "skill-a" },
        { skill: "skill-b" },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.stepResults).toHaveLength(1);
    expect(result.error).toContain('Step "skill-a" failed');
    expect(mockExecuteSkill).toHaveBeenCalledTimes(1);
  });

  it("should merge static input overrides", async () => {
    mockExecuteSkill.mockResolvedValue(makeStepResult());

    await executeWorkflow(
      {
        name: "input-wf",
        description: "test",
        steps: [{ skill: "skill-a", input: { key: "value" } }],
      },
      { other: 42 },
    );

    expect(mockExecuteSkill).toHaveBeenCalledWith("skill-a", { other: 42, key: "value" });
  });

  it("should map output from previous steps via mapInput", async () => {
    // Step result output is stored as context[step.id] = stepResult.output
    // So step1 = { extracted: "data" }, and "step1.extracted" resolves correctly
    mockExecuteSkill
      .mockResolvedValueOnce(makeStepResult({ output: { extracted: "data" } }))
      .mockResolvedValueOnce(makeStepResult());

    await executeWorkflow({
      name: "map-wf",
      description: "test",
      steps: [
        { skill: "skill-a" },
        {
          skill: "skill-b",
          mapInput: { mapped: "step1.extracted" },
        },
      ],
    });

    expect(mockExecuteSkill).toHaveBeenLastCalledWith("skill-b", { result: { extracted: "data" }, mapped: "data" });
  });

  it("should pass output as input to next step", async () => {
    mockExecuteSkill
      .mockResolvedValueOnce(makeStepResult({ output: "first-output" }))
      .mockResolvedValueOnce(makeStepResult());

    await executeWorkflow({
      name: "chain-wf",
      description: "test",
      steps: [
        { skill: "skill-a" },
        { skill: "skill-b" },
      ],
    });

    // Second call should receive { result: "first-output" }
    expect(mockExecuteSkill).toHaveBeenLastCalledWith("skill-b", { result: "first-output" });
  });

  it("should handle empty steps array", async () => {
    const result = await executeWorkflow({
      name: "empty",
      description: "test",
      steps: [],
    });

    expect(result.success).toBe(true);
    expect(result.stepResults).toEqual([]);
    expect(result.finalOutput).toBeNull();
  });

  it("should handle thrown errors gracefully", async () => {
    mockExecuteSkill.mockRejectedValue(new Error("unexpected crash"));

    const result = await executeWorkflow({
      name: "crash-wf",
      description: "test",
      steps: [{ skill: "skill-a" }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("unexpected crash");
  });

  it("should handle non-Error thrown values", async () => {
    mockExecuteSkill.mockRejectedValue("string error");

    const result = await executeWorkflow({
      name: "string-error",
      description: "test",
      steps: [{ skill: "skill-a" }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("string error");
  });

  it("should include durationMs in result", async () => {
    mockExecuteSkill.mockResolvedValue(makeStepResult());

    const result = await executeWorkflow({
      name: "timed",
      description: "test",
      steps: [{ skill: "skill-a" }],
    });

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("should use initialInput when provided", async () => {
    mockExecuteSkill.mockResolvedValue(makeStepResult());

    await executeWorkflow(
      {
        name: "init-wf",
        description: "test",
        steps: [{ skill: "skill-a" }],
      },
      { custom: "data" },
    );

    expect(mockExecuteSkill).toHaveBeenCalledWith("skill-a", { custom: "data" });
  });
});

describe("validateWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return empty array when all skills exist", () => {
    mockGetSkill.mockReturnValue({ manifest: {} as never, filePath: "<test>", loadedAt: "" });

    const errors = validateWorkflow({
      name: "valid",
      description: "test",
      steps: [{ skill: "skill-a" }, { skill: "skill-b" }],
    });

    expect(errors).toEqual([]);
  });

  it("should return errors for missing skills", () => {
    mockGetSkill.mockReturnValue(undefined);

    const errors = validateWorkflow({
      name: "invalid",
      description: "test",
      steps: [{ skill: "missing-skill" }],
    });

    expect(errors).toContain("Skill not found: missing-skill");
  });

  it("should return multiple errors for multiple missing skills", () => {
    mockGetSkill.mockReturnValue(undefined);

    const errors = validateWorkflow({
      name: "multi-invalid",
      description: "test",
      steps: [{ skill: "a" }, { skill: "b" }],
    });

    expect(errors).toHaveLength(2);
  });

  it("should return empty array for empty steps", () => {
    const errors = validateWorkflow({
      name: "empty",
      description: "test",
      steps: [],
    });

    expect(errors).toEqual([]);
  });

  it("should mix existing and missing skills", () => {
    mockGetSkill
      .mockReturnValueOnce({ manifest: {} as never, filePath: "<test>", loadedAt: "" })
      .mockReturnValueOnce(undefined);

    const errors = validateWorkflow({
      name: "mixed",
      description: "test",
      steps: [{ skill: "exists" }, { skill: "missing" }],
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe("Skill not found: missing");
  });
});
