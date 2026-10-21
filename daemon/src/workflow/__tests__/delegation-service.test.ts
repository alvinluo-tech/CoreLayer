import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AgentRunRow } from "../../persistence/repository/agent.js";

const mockGetById = vi.fn();
const mockCreate = vi.fn();

vi.mock("../../persistence/factory.js", () => ({
  getRepositories: () => ({
    agentRuns: { getById: mockGetById, create: mockCreate },
  }),
}));

const mockEnqueue = vi.fn();
vi.mock("../queue-service.js", () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
}));

const { boundsOf, dispatchAgent } = await import("../delegation-service.js");
const { DelegationRejected, rootDelegationBounds } = await import("../delegation-bounds.js");

function run(overrides: Partial<AgentRunRow> = {}): AgentRunRow {
  return {
    id: "parent-1",
    conversationId: "conv-1",
    workspaceId: "ws-1",
    projectId: "proj-1",
    taskId: null,
    agentId: "agent-1",
    userMessageId: null,
    assistantMessageId: null,
    status: "running",
    mode: "chat",
    selectedModel: null,
    routeReason: null,
    selectedTools: ["read", "edit"],
    memoryReads: null,
    memoryWrites: null,
    toolCalls: null,
    toolCallCount: null,
    artifacts: null,
    approvals: null,
    agentSnapshot: null,
    delegation: null,
    parentRunId: null,
    objective: null,
    startedAt: "2026-01-01T00:00:00Z",
    completedAt: null,
    durationMs: null,
    error: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnqueue.mockResolvedValue({ runId: "child-1", taskId: null, agentId: "agent-1", priority: 0, enqueuedAt: "" });
});

describe("boundsOf", () => {
  it("derives a root run's bounds from the tools it was given", () => {
    const bounds = boundsOf(run());
    expect(bounds.allowedTools).toEqual(["read", "edit"]);
    expect(bounds.allowedPaths).toEqual([]);
  });

  it("uses the granted bounds for a delegated run", () => {
    const granted = rootDelegationBounds({ allowedPaths: ["src/auth/**"], allowedTools: ["read"] });
    const bounds = boundsOf(
      run({
        delegation: {
          parentRunId: "grandparent",
          parentBounds: rootDelegationBounds(),
          grantedBounds: granted,
          dispatchedAt: "2026-01-01T00:00:01Z",
        },
      }),
    );
    expect(bounds).toEqual(granted);
  });
});

describe("dispatchAgent", () => {
  it("refuses a delegation from a run that has already ended", async () => {
    mockGetById.mockResolvedValue(run({ status: "succeeded" }));
    await expect(dispatchAgent({ parentRunId: "parent-1", task: "do it" })).rejects.toThrow(
      /already ended/i,
    );
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("refuses a delegation from a run that does not exist", async () => {
    mockGetById.mockResolvedValue(null);
    await expect(dispatchAgent({ parentRunId: "missing", task: "do it" })).rejects.toThrow(
      DelegationRejected,
    );
  });

  it("does not create a run when the bounds are rejected", async () => {
    mockGetById.mockResolvedValue(run());
    await expect(
      dispatchAgent({ parentRunId: "parent-1", task: "t", allowedPaths: ["../../etc/**"] }),
    ).rejects.toThrow(/inside the repository/i);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("enqueues a child with narrowed bounds and the parent link", async () => {
    mockGetById.mockResolvedValue(run());
    const result = await dispatchAgent({
      parentRunId: "parent-1",
      task: "fix the parser",
      allowedPaths: ["src/parser/**"],
      wait: false,
    });

    expect(result.childRunId).toBe("child-1");
    expect(result.stillRunning).toBe(true);
    const enqueued = mockEnqueue.mock.calls[0][0] as Record<string, unknown>;
    expect(enqueued.objective).toBe("fix the parser");
    expect(enqueued.parentRunId).toBe("parent-1");
    const delegation = enqueued.delegation as { grantedBounds: { allowedPaths: string[] } };
    expect(delegation.grantedBounds.allowedPaths).toEqual(["src/parser/**"]);
  });

  it("reports a finished child with its artifacts", async () => {
    mockGetById
      .mockResolvedValueOnce(run())
      .mockResolvedValue(
        run({
          id: "child-1",
          status: "succeeded",
          completedAt: "2026-01-01T00:10:00Z",
          artifacts: [{ type: "changed_files", content: "src/a.ts" }],
        }),
      );

    const result = await dispatchAgent({ parentRunId: "parent-1", task: "t" });

    expect(result.stillRunning).toBe(false);
    expect(result.status).toBe("succeeded");
    expect(result.artifacts).toHaveLength(1);
  });

  it("returns the child as still running rather than pretending it finished", async () => {
    mockGetById.mockResolvedValueOnce(run()).mockResolvedValue(run({ id: "child-1", status: "running" }));

    const result = await dispatchAgent({
      parentRunId: "parent-1",
      task: "t",
      waitTimeoutMs: 150,
      pollIntervalMs: 50,
    });

    expect(result.stillRunning).toBe(true);
    expect(result.status).toBe("running");
    expect(result.childRunId).toBe("child-1");
  });

  it("surfaces a failed child's error", async () => {
    mockGetById
      .mockResolvedValueOnce(run())
      .mockResolvedValue(
        run({ id: "child-1", status: "failed", completedAt: "2026-01-01T00:05:00Z", error: "tests failed" }),
      );

    const result = await dispatchAgent({ parentRunId: "parent-1", task: "t" });
    expect(result.status).toBe("failed");
    expect(result.error).toBe("tests failed");
  });
});
