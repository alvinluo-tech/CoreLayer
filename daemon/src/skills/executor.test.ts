import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SkillManifest, LoadedSkill } from "./types.js";

// Mock dependencies
vi.mock("./loader.js", () => ({
  getSkill: vi.fn(),
}));

vi.mock("../runtime/index.js", () => ({
  toolRuntime: {
    execute: vi.fn(),
  },
}));

import { executeSkill } from "./executor.js";
import { getSkill } from "./loader.js";
import { toolRuntime } from "../runtime/index.js";

const mockGetSkill = vi.mocked(getSkill);
const mockToolExecute = vi.mocked(toolRuntime.execute);

function makeSkill(manifest: SkillManifest): LoadedSkill {
  return {
    manifest,
    filePath: "<test>",
    loadedAt: new Date().toISOString(),
  };
}

function makeManifest(overrides: Partial<SkillManifest> = {}): SkillManifest {
  return {
    name: "test-skill",
    title: "Test Skill",
    description: "A test skill",
    version: "1.0.0",
    triggers: [],
    toolsUsed: [],
    risk: "low",
    steps: [],
    ...overrides,
  };
}

describe("executeSkill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return error when skill not found", async () => {
    mockGetSkill.mockReturnValue(undefined);

    const result = await executeSkill("nonexistent");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Skill not found");
    expect(result.steps).toEqual([]);
  });

  it("should execute a skill with no steps", async () => {
    mockGetSkill.mockReturnValue(makeSkill(makeManifest({ steps: [] })));

    const result = await executeSkill("empty-skill");

    expect(result.success).toBe(true);
    expect(result.steps).toEqual([]);
    expect(result.output).toBeNull();
  });

  it("should execute a single tool_call step", async () => {
    mockGetSkill.mockReturnValue(
      makeSkill(
        makeManifest({
          steps: [{ id: "step1", type: "tool_call", tool: "my_tool", args: { key: "val" } }],
        }),
      ),
    );
    mockToolExecute.mockResolvedValue({
      result: { success: true, data: { done: true } },
      confirmed: true,
      durationMs: 10,
    });

    const result = await executeSkill("single-step");

    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].success).toBe(true);
    expect(result.output).toEqual({ done: true });
    expect(mockToolExecute).toHaveBeenCalledWith("my_tool", { key: "val" }, {
      caller: "skill",
      skillName: "single-step",
    });
  });

  it("should stop execution when a tool_call step fails", async () => {
    mockGetSkill.mockReturnValue(
      makeSkill(
        makeManifest({
          steps: [
            { id: "step1", type: "tool_call", tool: "failing_tool" },
            { id: "step2", type: "tool_call", tool: "never_reached" },
          ],
        }),
      ),
    );
    mockToolExecute.mockResolvedValue({
      result: { success: false, error: "tool error" },
      confirmed: false,
      durationMs: 5,
    });

    const result = await executeSkill("fail-skill");

    expect(result.success).toBe(false);
    expect(result.steps).toHaveLength(1);
    expect(result.error).toContain("step1 failed");
    expect(mockToolExecute).toHaveBeenCalledTimes(1);
  });

  it("should pass output from one step as context to the next", async () => {
    mockGetSkill.mockReturnValue(
      makeSkill(
        makeManifest({
          steps: [
            { id: "step1", type: "tool_call", tool: "tool_a", args: { x: 1 } },
            { id: "step2", type: "tool_call", tool: "tool_b", args: { ref: "{{step1}}" } },
          ],
        }),
      ),
    );
    mockToolExecute
      .mockResolvedValueOnce({
        result: { success: true, data: "result_a" },
        confirmed: true,
        durationMs: 10,
      })
      .mockResolvedValueOnce({
        result: { success: true, data: "result_b" },
        confirmed: true,
        durationMs: 10,
      });

    const result = await executeSkill("chain-skill");

    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(2);
    // Second call should have step1 output resolved in args
    expect(mockToolExecute).toHaveBeenLastCalledWith("tool_b", { ref: "result_a" }, {
      caller: "skill",
      skillName: "chain-skill",
    });
  });

  it("should catch unexpected errors and return failure", async () => {
    mockGetSkill.mockReturnValue(
      makeSkill(
        makeManifest({
          steps: [{ id: "step1", type: "tool_call", tool: "crash_tool" }],
        }),
      ),
    );
    mockToolExecute.mockRejectedValue(new Error("boom"));

    const result = await executeSkill("crash-skill");

    expect(result.success).toBe(false);
    expect(result.error).toContain("boom");
  });
});

describe("condition step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should evaluate truthy condition", async () => {
    mockGetSkill.mockReturnValue(
      makeSkill(
        makeManifest({
          steps: [
            {
              id: "cond1",
              type: "condition",
              condition: "input.ready",
              then: "next_step",
              else: "fallback",
            },
          ],
        }),
      ),
    );

    const result = await executeSkill("cond-skill", { ready: true });

    expect(result.success).toBe(true);
    expect(result.steps[0].output).toEqual({ condition: true, next: "next_step" });
  });

  it("should evaluate falsy condition", async () => {
    mockGetSkill.mockReturnValue(
      makeSkill(
        makeManifest({
          steps: [
            {
              id: "cond1",
              type: "condition",
              condition: "input.ready",
              then: "next_step",
              else: "fallback",
            },
          ],
        }),
      ),
    );

    const result = await executeSkill("cond-false-skill", { ready: false });

    expect(result.success).toBe(true);
    expect(result.steps[0].output).toEqual({ condition: false, next: "fallback" });
  });

  it("should evaluate comparison expressions", async () => {
    mockGetSkill.mockReturnValue(
      makeSkill(
        makeManifest({
          steps: [
            {
              id: "cond1",
              type: "condition",
              condition: "input.count > 5",
              then: "many",
              else: "few",
            },
          ],
        }),
      ),
    );

    const result = await executeSkill("compare-skill", { count: 10 });

    expect(result.success).toBe(true);
    expect(result.steps[0].output).toEqual({ condition: true, next: "many" });
  });

  it("should reject dangerous expressions", async () => {
    mockGetSkill.mockReturnValue(
      makeSkill(
        makeManifest({
          steps: [
            {
              id: "cond1",
              type: "condition",
              condition: "eval('alert(1)')",
              then: "bad",
              else: "safe",
            },
          ],
        }),
      ),
    );

    const result = await executeSkill("danger-skill");

    expect(result.success).toBe(true);
    expect(result.steps[0].output).toEqual({ condition: false, next: "safe" });
  });
});

describe("transform step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should evaluate transform expression to truthy", async () => {
    mockGetSkill.mockReturnValue(
      makeSkill(
        makeManifest({
          steps: [
            {
              id: "t1",
              type: "transform",
              transform: "input.name",
            },
          ],
        }),
      ),
    );

    const result = await executeSkill("transform-skill", { name: "Alice" });

    expect(result.success).toBe(true);
    expect(result.steps[0].output).toBe(true);
  });

  it("should evaluate transform expression to falsy", async () => {
    mockGetSkill.mockReturnValue(
      makeSkill(
        makeManifest({
          steps: [
            {
              id: "t1",
              type: "transform",
              transform: "input.missing",
            },
          ],
        }),
      ),
    );

    const result = await executeSkill("transform-falsy");

    expect(result.success).toBe(true);
    expect(result.steps[0].output).toBe(false);
  });

  it("should handle missing transform expression", async () => {
    mockGetSkill.mockReturnValue(
      makeSkill(
        makeManifest({
          steps: [{ id: "t1", type: "transform" }],
        }),
      ),
    );

    const result = await executeSkill("no-transform");

    expect(result.success).toBe(true);
    expect(result.steps[0].output).toBe(false);
  });
});

describe("output step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should resolve output template", async () => {
    mockGetSkill.mockReturnValue(
      makeSkill(
        makeManifest({
          steps: [
            {
              id: "out1",
              type: "output",
              template: "Hello {{input.name}}, you have {{input.count}} items",
            },
          ],
        }),
      ),
    );

    const result = await executeSkill("output-skill", { name: "Bob", count: 5 });

    expect(result.success).toBe(true);
    expect(result.steps[0].output).toBe("Hello Bob, you have 5 items");
  });

  it("should handle empty template", async () => {
    mockGetSkill.mockReturnValue(
      makeSkill(
        makeManifest({
          steps: [{ id: "out1", type: "output", template: "" }],
        }),
      ),
    );

    const result = await executeSkill("empty-template");

    expect(result.success).toBe(true);
    expect(result.steps[0].output).toBe("");
  });
});

describe("unknown step type", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return error for unknown step type", async () => {
    mockGetSkill.mockReturnValue(
      makeSkill(
        makeManifest({
          steps: [{ id: "bad1", type: "unknown_type" as any }],
        }),
      ),
    );

    const result = await executeSkill("unknown-step-skill");

    expect(result.success).toBe(true); // unknown steps don't stop execution
    expect(result.steps[0].success).toBe(false);
    expect(result.steps[0].error).toContain("Unknown step type");
  });
});

describe("tool_call step edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle tool_call step with no tool specified", async () => {
    mockGetSkill.mockReturnValue(
      makeSkill(
        makeManifest({
          steps: [{ id: "step1", type: "tool_call" }],
        }),
      ),
    );

    const result = await executeSkill("no-tool-skill");

    expect(result.success).toBe(false);
    expect(result.steps[0].success).toBe(false);
    expect(result.steps[0].error).toContain("No tool specified");
  });

  it("should handle tool returning error result", async () => {
    mockGetSkill.mockReturnValue(
      makeSkill(
        makeManifest({
          steps: [{ id: "step1", type: "tool_call", tool: "err_tool" }],
        }),
      ),
    );
    mockToolExecute.mockResolvedValue({
      result: { success: false, error: "permission denied" },
      confirmed: false,
      durationMs: 5,
    });

    const result = await executeSkill("err-skill");

    expect(result.success).toBe(false);
    expect(result.steps[0].success).toBe(false);
    expect(result.steps[0].error).toBe("permission denied");
  });
});
