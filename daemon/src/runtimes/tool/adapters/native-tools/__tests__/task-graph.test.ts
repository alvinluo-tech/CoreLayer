import { describe, it, expect, beforeEach, vi } from "vitest";

let capturedExecute: ((args: unknown) => Promise<unknown>) | null = null;

vi.mock("../registry.js", () => ({
  registerTool: (_name: string, definition: { execute: (args: unknown) => Promise<unknown> }) => {
    capturedExecute = definition.execute;
  },
}));

vi.mock("../../../../../workflow/task-graph-executor.js", () => ({
  executeTaskGraph: vi.fn(),
}));

vi.mock("../../../../../workflow/task-graph-dag.js", () => ({
  TaskGraphRejected: class TaskGraphRejected extends Error {},
}));

vi.mock("../../../../../workflow/delegation-bounds.js", () => ({
  MAX_DELEGATION_TIMEOUT_MS: 1_800_000,
  MIN_DELEGATION_TIMEOUT_MS: 30_000,
  DelegationRejected: class DelegationRejected extends Error {},
}));

const { registerTaskGraphTools } = await import("../task-graph.js");
const { withToolInvocationContext } = await import("../../../domain/tool-call-id.js");

class FakeRejection extends Error {}

function setup(
  executeFn: (parentRunId: string, input: unknown) => Promise<unknown>,
) {
  const spy = vi.fn(executeFn);
  registerTaskGraphTools({
    execute: spy as never,
    isRejection: (error: unknown) => error instanceof FakeRejection,
  });
  return { executeSpy: spy };
}

function runTool(args: unknown, runId?: string): Promise<unknown> {
  const fn = capturedExecute!;
  return withToolInvocationContext(runId, () => fn(args));
}

beforeEach(() => {
  capturedExecute = null;
});

describe("run_task_graph tool", () => {
  it("registers run_task_graph with an execute function", () => {
    setup(async () => ({}));
    expect(capturedExecute).toBeTypeOf("function");
  });

  it("refuses to run outside an agent run context", async () => {
    const { executeSpy } = setup(async () => ({}));
    await expect(runTool({ nodes: [{ id: "solo", task: "Task" }] }, undefined)).rejects.toThrow(
      /only available inside an agent run/i,
    );
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it("delegates to executeTaskGraph with the ambient parent runId", async () => {
    const mockSummary = {
      status: "succeeded",
      totalDurationMs: 1500,
      completedNodes: 2,
      failedNodes: 0,
      skippedNodes: 0,
      nodeResults: {},
      parallelPathWarnings: [],
    };

    const { executeSpy } = setup(async () => mockSummary);
    const parentRunId = "run-parent-xyz";

    const result = (await runTool(
      {
        nodes: [
          { id: "step-1", task: "Do part 1" },
          { id: "step-2", task: "Do part 2", dependencies: ["step-1"] },
        ],
      },
      parentRunId,
    )) as typeof mockSummary & { note: string };

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy).toHaveBeenCalledWith(parentRunId, {
      nodes: [
        { id: "step-1", task: "Do part 1" },
        { id: "step-2", task: "Do part 2", dependencies: ["step-1"] },
      ],
    });
    expect(result.status).toBe("succeeded");
    expect(result.note).toContain("All 2 task graph nodes finished successfully");
  });

  it("returns rejected status when graph validation or bounds narrowing fails", async () => {
    const { executeSpy } = setup(async () => {
      throw new FakeRejection("Cycle detected between node-a and node-b");
    });

    const result = (await runTool(
      {
        nodes: [{ id: "a", task: "A" }],
      },
      "some-parent-run",
    )) as { status: string; error: string };

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("rejected");
    expect(result.error).toContain("Cycle detected");
  });
});
