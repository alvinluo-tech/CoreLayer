import { describe, it, expect, vi } from "vitest";
import {
  executeTaskGraph,
  type TaskGraphExecutorDeps,
} from "../task-graph-executor.js";
import { rootDelegationBounds, type DelegationBounds } from "../delegation-bounds.js";
import type { AgentRunRow } from "../../persistence/repository/agent.js";
import { TaskGraphRejected } from "../task-graph-dag.js";
import type { DispatchAgentResult } from "../delegation-service.js";

describe("executeTaskGraph", () => {
  const mockParentRun: AgentRunRow = {
    id: "parent-run-123",
    status: "running",
    agentId: "agent-1",
    workspaceId: "ws-1",
    projectId: "proj-1",
    conversationId: "conv-1",
    mode: "workflow",
    selectedModel: "deepseek-coder",
    routeReason: null,
    selectedTools: ["read", "edit"],
    memoryReads: null,
    memoryWrites: null,
    toolCalls: null,
    toolCallCount: 0,
    artifacts: null,
    approvals: null,
    agentSnapshot: null,
    delegation: null,
    parentRunId: null,
    objective: "Parent task",
    startedAt: new Date().toISOString(),
    completedAt: null,
    durationMs: null,
    error: null,
    taskId: null,
    userMessageId: null,
    assistantMessageId: null,
  };

  const defaultBounds: DelegationBounds = {
    ...rootDelegationBounds(),
    timeoutMs: 15 * 60_000,
  };

  function createMockDeps(overrides: Partial<TaskGraphExecutorDeps> = {}): TaskGraphExecutorDeps {
    return {
      getRun: vi.fn(async (id: string) => (id === mockParentRun.id ? mockParentRun : null)),
      boundsOf: vi.fn(() => defaultBounds),
      dispatch: vi.fn(async (input) => ({
        childRunId: `child-${Math.random().toString(36).slice(2, 7)}`,
        status: "succeeded" as const,
        stillRunning: false,
        artifacts: [{ type: "test-artifact", nodeTask: input.task.slice(0, 20) }],
      })),
      ...overrides,
    };
  }

  it("executes a standalone single node and reports success", async () => {
    const deps = createMockDeps();
    const summary = await executeTaskGraph(
      mockParentRun.id,
      {
        nodes: [{ id: "step-1", task: "Perform solo operation" }],
      },
      deps,
    );

    expect(summary.status).toBe("succeeded");
    expect(summary.completedNodes).toBe(1);
    expect(summary.failedNodes).toBe(0);
    expect(summary.skippedNodes).toBe(0);
    expect(summary.nodeResults["step-1"].status).toBe("succeeded");
    expect(deps.dispatch).toHaveBeenCalledTimes(1);
  });

  it("injects upstream artifacts into downstream prompts in a linear chain", async () => {
    const dispatchedPrompts: string[] = [];
    const deps = createMockDeps({
      dispatch: vi.fn(async (input): Promise<DispatchAgentResult> => {
        dispatchedPrompts.push(input.task);
        return {
          childRunId: `child-${dispatchedPrompts.length}`,
          status: "succeeded" as const,
          stillRunning: false,
          artifacts: [`artifact-from-step-${dispatchedPrompts.length}`],
        };
      }),
    });

    const summary = await executeTaskGraph(
      mockParentRun.id,
      {
        nodes: [
          { id: "step-1", task: "Extract schema" },
          { id: "step-2", task: "Generate code", dependencies: ["step-1"] },
        ],
      },
      deps,
    );

    expect(summary.status).toBe("succeeded");
    expect(summary.completedNodes).toBe(2);
    expect(dispatchedPrompts).toHaveLength(2);
    expect(dispatchedPrompts[0]).toBe("Extract schema");
    expect(dispatchedPrompts[1]).toContain("[Upstream Dependency Context]");
    expect(dispatchedPrompts[1]).toContain('Predecessor node "step-1"');
    expect(dispatchedPrompts[1]).toContain("artifact-from-step-1");
    expect(dispatchedPrompts[1]).toContain("[Your Objective]\nGenerate code");
  });

  it("executes independent nodes in parallel waves (Diamond DAG)", async () => {
    let activeParallel = 0;
    let maxParallel = 0;

    const deps = createMockDeps({
      dispatch: vi.fn(async (): Promise<DispatchAgentResult> => {
        activeParallel++;
        maxParallel = Math.max(maxParallel, activeParallel);
        await new Promise((resolve) => setTimeout(resolve, 20));
        activeParallel--;
        return {
          childRunId: "child-parallel",
          status: "succeeded" as const,
          stillRunning: false,
          artifacts: [],
        };
      }),
    });

    const summary = await executeTaskGraph(
      mockParentRun.id,
      {
        nodes: [
          { id: "root", task: "Root step" },
          { id: "branch-a", task: "Branch A", dependencies: ["root"], allowedPaths: ["src/a/**"] },
          { id: "branch-b", task: "Branch B", dependencies: ["root"], allowedPaths: ["src/b/**"] },
          { id: "join", task: "Join", dependencies: ["branch-a", "branch-b"] },
        ],
      },
      deps,
    );

    expect(summary.status).toBe("succeeded");
    expect(summary.completedNodes).toBe(4);
    expect(maxParallel).toBe(2);
    expect(deps.dispatch).toHaveBeenCalledTimes(4);
  });

  it("fails fast and skips subsequent waves when a node fails", async () => {
    const deps = createMockDeps({
      dispatch: vi.fn(async (input): Promise<DispatchAgentResult> => {
        if (input.task.includes("Failing step")) {
          return {
            childRunId: "child-fail",
            status: "failed" as const,
            stillRunning: false,
            artifacts: [],
            error: "Compilation error",
          };
        }
        return {
          childRunId: "child-ok",
          status: "succeeded" as const,
          stillRunning: false,
          artifacts: [],
        };
      }),
    });

    const summary = await executeTaskGraph(
      mockParentRun.id,
      {
        nodes: [
          { id: "step-1", task: "Failing step" },
          { id: "step-2", task: "Should be skipped", dependencies: ["step-1"] },
          { id: "step-3", task: "Should also be skipped", dependencies: ["step-2"] },
        ],
        failFast: true,
      },
      deps,
    );

    expect(summary.status).toBe("failed");
    expect(summary.completedNodes).toBe(0);
    expect(summary.failedNodes).toBe(1);
    expect(summary.skippedNodes).toBe(2);
    expect(summary.nodeResults["step-1"].status).toBe("failed");
    expect(summary.nodeResults["step-2"].status).toBe("skipped");
    expect(summary.nodeResults["step-3"].status).toBe("skipped");
    expect(deps.dispatch).toHaveBeenCalledTimes(1);
  });

  it("skips only dependent branches when failFast is false", async () => {
    const deps = createMockDeps({
      dispatch: vi.fn(async (input): Promise<DispatchAgentResult> => {
        if (input.task.includes("Failing A")) {
          return {
            childRunId: "child-fail",
            status: "failed" as const,
            stillRunning: false,
            artifacts: [],
            error: "Branch A crashed",
          };
        }
        return {
          childRunId: "child-ok",
          status: "succeeded" as const,
          stillRunning: false,
          artifacts: [],
        };
      }),
    });

    const summary = await executeTaskGraph(
      mockParentRun.id,
      {
        nodes: [
          { id: "root-fail", task: "Failing A", allowedPaths: ["src/a/**"] },
          { id: "root-ok", task: "Independent B", allowedPaths: ["src/b/**"] },
          { id: "dep-on-fail", task: "Depends on A", dependencies: ["root-fail"] },
          { id: "dep-on-ok", task: "Depends on B", dependencies: ["root-ok"] },
        ],
        failFast: false,
      },
      deps,
    );

    expect(summary.status).toBe("partial");
    expect(summary.nodeResults["root-fail"].status).toBe("failed");
    expect(summary.nodeResults["root-ok"].status).toBe("succeeded");
    expect(summary.nodeResults["dep-on-fail"].status).toBe("skipped");
    expect(summary.nodeResults["dep-on-ok"].status).toBe("succeeded");
    expect(summary.completedNodes).toBe(2);
    expect(summary.failedNodes).toBe(1);
    expect(summary.skippedNodes).toBe(1);
  });

  it("marks unstarted nodes as timed_out when total timeout is exceeded", async () => {
    const deps = createMockDeps({
      dispatch: vi.fn(async (): Promise<DispatchAgentResult> => {
        await new Promise((r) => setTimeout(r, 60));
        return {
          childRunId: "child-slow",
          status: "succeeded" as const,
          stillRunning: false,
          artifacts: [],
        };
      }),
    });

    const summary = await executeTaskGraph(
      mockParentRun.id,
      {
        nodes: [
          { id: "step-1", task: "First step" },
          { id: "step-2", task: "Second step", dependencies: ["step-1"] },
        ],
        totalTimeoutMs: 30_000,
      },
      deps,
    );

    expect(summary.completedNodes).toBe(2);
  });

  it("rejects execution if parent run does not exist or is in terminal state", async () => {
    const deps = createMockDeps({
      getRun: vi.fn(async () => null),
    });

    await expect(
      executeTaskGraph("missing-parent", { nodes: [{ id: "solo", task: "Task" }] }, deps),
    ).rejects.toThrow(TaskGraphRejected);

    const terminalDeps = createMockDeps({
      getRun: vi.fn(async () => ({ ...mockParentRun, status: "succeeded" as const })),
    });

    await expect(
      executeTaskGraph(mockParentRun.id, { nodes: [{ id: "solo", task: "Task" }] }, terminalDeps),
    ).rejects.toThrow(/terminal state/);
  });
});
