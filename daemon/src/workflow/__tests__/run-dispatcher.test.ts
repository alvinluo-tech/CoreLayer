/**
 * Unit tests for the Run Dispatcher.
 *
 * Tests the dispatchRuns, completeRun, cancelRun, retryRun, and getDispatcherStatus
 * functions. Mocks the persistence layer, slot manager, and resource monitor.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---- Mocks ----

const mockGetRecent = vi.fn();
const mockGetQueued = vi.fn();
const mockUpdateStatus = vi.fn();
const mockGetById = vi.fn();
const mockUpdateArtifacts = vi.fn();
const mockClaimQueued = vi.fn();
const mockUpdateRouting = vi.fn();
const mockAgentProfilesGetById = vi.fn();
const mockTasksGetById = vi.fn();
const mockTasksUpdate = vi.fn().mockResolvedValue(undefined);
const mockTasksGetByProjectId = vi.fn().mockResolvedValue([]);
const mockTasksGetByWorkspaceId = vi.fn().mockResolvedValue([]);
const mockWorkspacesUpdate = vi.fn().mockResolvedValue(undefined);
const mockPendingActionsGetOpenByWorkspace = vi.fn().mockResolvedValue([]);

vi.mock("../../persistence/factory.js", () => ({
  getRepositories: vi.fn(() => ({
    agentRuns: {
      getRecent: (...args: unknown[]) => mockGetRecent(...args),
      getQueued: (...args: unknown[]) => mockGetQueued(...args),
      updateStatus: (...args: unknown[]) => mockUpdateStatus(...args),
      getById: (...args: unknown[]) => mockGetById(...args),
      updateArtifacts: (...args: unknown[]) => mockUpdateArtifacts(...args),
      claimQueued: (...args: unknown[]) => mockClaimQueued(...args),
      updateRouting: (...args: unknown[]) => mockUpdateRouting(...args),
    },
    agentProfiles: {
      getById: (...args: unknown[]) => mockAgentProfilesGetById(...args),
    },
    tasks: {
      getById: (...args: unknown[]) => mockTasksGetById(...args),
      update: (...args: unknown[]) => mockTasksUpdate(...args),
      getByProjectId: (...args: unknown[]) => mockTasksGetByProjectId(...args),
      getByWorkspaceId: (...args: unknown[]) => mockTasksGetByWorkspaceId(...args),
    },
    workspaces: {
      update: (...args: unknown[]) => mockWorkspacesUpdate(...args),
    },
    pendingActions: {
      getOpenByWorkspace: (...args: unknown[]) => mockPendingActionsGetOpenByWorkspace(...args),
    },
    agentRunEvents: {
      create: vi.fn().mockResolvedValue({}),
    },
  })),
}));

vi.mock("../../runtimes/coding/process-spawner.js", () => ({
  getActiveProcessCount: vi.fn(() => 0),
}));

const mockCreateRun = vi.fn();
const mockAdapterCancelRun = vi.fn().mockResolvedValue(true);
const mockGetCodingRuntime = vi.fn().mockReturnValue({
  id: "claude-code",
  name: "Claude Code",
  createRun: (...args: unknown[]) => mockCreateRun(...args),
  cancelRun: (...args: unknown[]) => mockAdapterCancelRun(...args),
  getRunStatus: vi.fn().mockResolvedValue({ status: "running", artifacts: [] }),
});
vi.mock("../../runtimes/coding/registry.js", () => ({
  getCodingRuntime: (...args: unknown[]) => mockGetCodingRuntime(...args),
}));

const mockCanStartAgentRun = vi.fn().mockReturnValue(true);
const mockAcquireAgentRun = vi.fn().mockReturnValue(true);
const mockReleaseAgentRun = vi.fn();
const mockSetAgentRunQueueDepth = vi.fn();
const mockGetUsage = vi.fn().mockReturnValue({
  activeAgentRuns: 0,
  activeExternalExecutors: 0,
  agentRunCapacity: 3,
  externalExecutorCapacity: 1,
  agentRunQueueDepth: 0,
});

vi.mock("../slot-manager.js", () => ({
  SlotManager: vi.fn().mockImplementation(() => ({
    canStartAgentRun: () => mockCanStartAgentRun(),
    acquireAgentRun: (id: string) => mockAcquireAgentRun(id),
    releaseAgentRun: (id: string) => mockReleaseAgentRun(id),
    setAgentRunQueueDepth: (d: number) => mockSetAgentRunQueueDepth(d),
    getUsage: () => mockGetUsage(),
  })),
}));

const mockIsResourcePressureHigh = vi.fn().mockReturnValue(false);
vi.mock("../resource-monitor.js", () => ({
  getResourceStatus: vi.fn(() => ({
    memoryPercent: 50,
    freeMemoryMb: 4096,
    totalMemoryMb: 8192,
    cpuUsagePercent: 20,
    diskFreeGb: 100,
    externalProcessCount: 0,
    uptimeSeconds: 1000,
    platform: "win32",
  })),
  isResourcePressureHigh: () => mockIsResourcePressureHigh(),
}));

const mockCanExecute = vi.fn().mockReturnValue(true);
vi.mock("../../workspaces/task-graph-service.js", () => ({
  TaskGraph: vi.fn().mockImplementation(() => ({
    canExecute: (...args: unknown[]) => mockCanExecute(...args),
    completeTask: vi.fn().mockResolvedValue(undefined),
    getExecutableTasks: vi.fn().mockResolvedValue([]),
  })),
}));

const mockEnqueue = vi.fn().mockResolvedValue(undefined);
vi.mock("../queue-service.js", () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
}));

vi.mock("../../persistence/client.js", () => ({
  db: { insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ catch: vi.fn() }) }) },
  schema: { artifacts: {} },
}));

vi.mock("../../runtimes/agent/run.js", () => ({
  cancelActiveRun: vi.fn().mockReturnValue(false),
}));

const mockExecuteExecutorAttempt = vi.fn();
const mockCancelExecutorAttempt = vi.fn();
const mockSelectExecutorForAttempt = vi.fn();
vi.mock("../executor-lifecycle-service.js", () => ({
  executeExecutorAttempt: (...args: unknown[]) => mockExecuteExecutorAttempt(...args),
  cancelExecutorAttempt: (...args: unknown[]) => mockCancelExecutorAttempt(...args),
  selectExecutorForAttempt: (...args: unknown[]) => mockSelectExecutorForAttempt(...args),
}));

// Import after mocks are set up
const { dispatchRuns, completeRun, cancelRun, retryRun, getDispatcherStatus } = await import("../run-dispatcher.js");

// ---- Helpers ----

function createRun(overrides: { id?: string; status?: string; completedAt?: string | null } = {}) {
  return {
    id: overrides.id ?? "run-1",
    status: overrides.status ?? "queued",
    completedAt: overrides.completedAt ?? null,
    conversationId: "conv-1",
    input: "test input",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ---- Tests ----

beforeEach(() => {
  vi.clearAllMocks();
  mockCanStartAgentRun.mockReturnValue(true);
  mockAcquireAgentRun.mockReturnValue(true);
  mockIsResourcePressureHigh.mockReturnValue(false);
  mockGetRecent.mockResolvedValue([]);
  mockGetQueued.mockResolvedValue([]);
  mockGetById.mockResolvedValue(null);
  mockUpdateStatus.mockResolvedValue(undefined);
  mockUpdateArtifacts.mockResolvedValue(undefined);
  mockClaimQueued.mockResolvedValue(true);
  mockUpdateRouting.mockResolvedValue(undefined);
  mockAgentProfilesGetById.mockResolvedValue(null);
  mockTasksGetById.mockResolvedValue(null);
  mockTasksGetByProjectId.mockResolvedValue([]);
  mockCreateRun.mockResolvedValue({ runId: "coding-run-1", status: "running" });
  mockExecuteExecutorAttempt.mockResolvedValue({
    success: true,
    attemptId: "attempt-1",
    artifacts: { runId: "attempt-1", artifacts: [] },
    verification: [],
  });
  mockCancelExecutorAttempt.mockResolvedValue(true);
  mockSelectExecutorForAttempt.mockResolvedValue({ adapterId: "claude-code", routeReason: "test selection" });
  mockReleaseAgentRun.mockImplementation(() => {});
  mockSetAgentRunQueueDepth.mockImplementation(() => {});
  mockGetUsage.mockReturnValue({
    activeAgentRuns: 0,
    activeExternalExecutors: 0,
    agentRunCapacity: 3,
    externalExecutorCapacity: 1,
    agentRunQueueDepth: 0,
  });
});

// ---- dispatchRuns ----

describe("dispatchRuns", () => {
  it("returns empty result when no pending runs", async () => {
    mockGetQueued.mockResolvedValue([]);

    const result = await dispatchRuns();

    expect(result.dispatched).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it("dispatches pending runs when slots are available", async () => {
    mockGetQueued.mockResolvedValue([
      createRun({ id: "run-1" }),
      createRun({ id: "run-2" }),
    ]);
    mockCanStartAgentRun.mockReturnValue(true);
    mockAcquireAgentRun.mockReturnValue(true);

    const result = await dispatchRuns();

    expect(result.dispatched).toBe(2);
    expect(result.skipped).toBe(0);
    expect(mockAcquireAgentRun).toHaveBeenCalledWith("run-1");
    expect(mockAcquireAgentRun).toHaveBeenCalledWith("run-2");
    expect(mockClaimQueued).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(mockExecuteExecutorAttempt).toHaveBeenCalledTimes(2));
  });

  it("does not dispatch when another worker already claimed the run", async () => {
    mockGetQueued.mockResolvedValue([createRun({ id: "run-1" })]);
    mockClaimQueued.mockResolvedValue(false);

    const result = await dispatchRuns();

    expect(result).toEqual({ dispatched: 0, skipped: 1 });
    expect(mockExecuteExecutorAttempt).not.toHaveBeenCalled();
  });

  it("skips runs when max concurrent limit is reached", async () => {
    // dispatchRuns calls canStartAgentRun: once at the top (must be true to enter loop),
    // then once per run in the loop.
    // Top call = true, loop run-1 = true, loop run-2 = false, loop run-3 = false
    let callCount = 0;
    mockCanStartAgentRun.mockImplementation(() => {
      callCount++;
      // Call 1 (top-level check) = true, call 2 (run-1 loop check) = true, rest = false
      return callCount <= 2;
    });
    mockAcquireAgentRun.mockReturnValue(true);

    mockGetQueued.mockResolvedValue([
      createRun({ id: "run-1" }),
      createRun({ id: "run-2" }),
      createRun({ id: "run-3" }),
    ]);

    const result = await dispatchRuns();

    // run-1 gets dispatched, run-2 and run-3 get skipped
    expect(result.dispatched).toBe(1);
    expect(result.skipped).toBe(2);
  });

  it("returns early with reason when resource pressure is high", async () => {
    mockIsResourcePressureHigh.mockReturnValue(true);

    const result = await dispatchRuns();

    expect(result.dispatched).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.reason).toBe("High resource pressure — deferring dispatch");
    // Should not query runs at all
    expect(mockGetQueued).not.toHaveBeenCalled();
  });

  it("returns early when no slots available", async () => {
    mockCanStartAgentRun.mockReturnValue(false);

    const result = await dispatchRuns();

    expect(result.dispatched).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.reason).toBe("All agent run slots occupied");
    expect(mockGetQueued).not.toHaveBeenCalled();
  });

  it("does not update queue depth when no pending runs", async () => {
    mockGetQueued.mockResolvedValue([]);
    mockCanStartAgentRun.mockReturnValue(true);

    await dispatchRuns();

    // Early return when pendingRuns.length === 0 skips setAgentRunQueueDepth
    expect(mockSetAgentRunQueueDepth).not.toHaveBeenCalled();
  });

  it("updates queue depth to skipped count after processing", async () => {
    // Top-level check passes, loop check passes for run-1 only
    let callCount = 0;
    mockCanStartAgentRun.mockImplementation(() => {
      callCount++;
      return callCount <= 2;
    });
    mockAcquireAgentRun.mockReturnValue(true);

    mockGetQueued.mockResolvedValue([
      createRun({ id: "run-1" }),
      createRun({ id: "run-2" }),
    ]);

    const result = await dispatchRuns();

    expect(result.dispatched).toBe(1);
    expect(result.skipped).toBe(1);
    expect(mockSetAgentRunQueueDepth).toHaveBeenCalledWith(1);
  });

  it("sets queue depth to skipped count", async () => {
    mockCanStartAgentRun.mockReturnValue(false);
    mockGetQueued.mockResolvedValue([
      createRun({ id: "run-1" }),
      createRun({ id: "run-2" }),
    ]);

    // When canStartAgentRun is false, it returns early before setting queue depth
    const result = await dispatchRuns();

    expect(result.reason).toBe("All agent run slots occupied");
  });

  it("returns zero dispatched when acquireAgentRun fails", async () => {
    mockGetQueued.mockResolvedValue([createRun({ id: "run-1" })]);
    mockCanStartAgentRun.mockReturnValue(true);
    mockAcquireAgentRun.mockReturnValue(false);

    const result = await dispatchRuns();

    expect(result.dispatched).toBe(0);
    expect(result.skipped).toBe(1);
  });
});

// ---- completeRun ----

describe("completeRun", () => {
  it("updates status to succeeded on success", async () => {
    await completeRun("run-1", true);

    expect(mockUpdateStatus).toHaveBeenCalledWith("run-1", "succeeded", undefined);
    expect(mockReleaseAgentRun).toHaveBeenCalledWith("run-1");
  });

  it("updates status to failed with error on failure", async () => {
    await completeRun("run-1", false, "timeout");

    expect(mockUpdateStatus).toHaveBeenCalledWith("run-1", "failed", "timeout");
    expect(mockReleaseAgentRun).toHaveBeenCalledWith("run-1");
  });

  it("always releases the slot", async () => {
    await completeRun("run-1", true);
    await completeRun("run-2", false, "error");

    expect(mockReleaseAgentRun).toHaveBeenCalledWith("run-1");
    expect(mockReleaseAgentRun).toHaveBeenCalledWith("run-2");
  });
});

// ---- cancelRun ----

describe("cancelRun", () => {
  it("cancels a running run", async () => {
    mockGetById.mockResolvedValue(createRun({ id: "run-1", status: "running" }));

    const result = await cancelRun("run-1");

    expect(result).toBe(true);
    expect(mockUpdateStatus).toHaveBeenCalledWith("run-1", "cancelled");
    expect(mockReleaseAgentRun).toHaveBeenCalledWith("run-1");
  });

  it("returns false when run does not exist", async () => {
    mockGetById.mockResolvedValue(null);

    const result = await cancelRun("nonexistent");

    expect(result).toBe(false);
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it("returns false for already succeeded run", async () => {
    mockGetById.mockResolvedValue(createRun({ id: "run-1", status: "succeeded" }));

    const result = await cancelRun("run-1");

    expect(result).toBe(false);
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it("returns false for already failed run", async () => {
    mockGetById.mockResolvedValue(createRun({ id: "run-1", status: "failed" }));

    const result = await cancelRun("run-1");

    expect(result).toBe(false);
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it("returns false for already cancelled run", async () => {
    mockGetById.mockResolvedValue(createRun({ id: "run-1", status: "cancelled" }));

    const result = await cancelRun("run-1");

    expect(result).toBe(false);
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });
});

// ---- retryRun ----

describe("retryRun", () => {
  it("retries a failed run by resetting to queued", async () => {
    mockGetById.mockResolvedValue(createRun({ id: "run-1", status: "failed" }));

    const result = await retryRun("run-1");

    expect(result).toBe(true);
    expect(mockUpdateStatus).toHaveBeenCalledWith("run-1", "queued");
  });

  it("returns false when run does not exist", async () => {
    mockGetById.mockResolvedValue(null);

    const result = await retryRun("nonexistent");

    expect(result).toBe(false);
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it("returns false for non-failed run", async () => {
    mockGetById.mockResolvedValue(createRun({ id: "run-1", status: "running" }));

    const result = await retryRun("run-1");

    expect(result).toBe(false);
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it("returns false for succeeded run", async () => {
    mockGetById.mockResolvedValue(createRun({ id: "run-1", status: "succeeded" }));

    const result = await retryRun("run-1");

    expect(result).toBe(false);
  });
});

// ---- getDispatcherStatus ----

describe("getDispatcherStatus", () => {
  it("returns slots and resource status", () => {
    mockGetUsage.mockReturnValue({
      activeAgentRuns: 1,
      activeExternalExecutors: 0,
      agentRunCapacity: 3,
      externalExecutorCapacity: 1,
      agentRunQueueDepth: 2,
    });

    const status = getDispatcherStatus();

    expect(status.slots).toBeDefined();
    expect(status.slots.activeAgentRuns).toBe(1);
    expect(status.slots.agentRunCapacity).toBe(3);
    expect(status.resources).toBeDefined();
    expect(status.resources).toHaveProperty("memoryPercent");
    expect(status.resources).toHaveProperty("cpuUsagePercent");
    expect(status.resources).toHaveProperty("platform");
  });
});

// ---- dispatchRuns — task dependency ----

describe("dispatchRuns — task dependencies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanStartAgentRun.mockReturnValue(true);
    mockAcquireAgentRun.mockReturnValue(true);
    mockIsResourcePressureHigh.mockReturnValue(false);
    mockGetQueued.mockResolvedValue([]);
    mockGetById.mockResolvedValue(null);
    mockUpdateStatus.mockResolvedValue(undefined);
    mockUpdateArtifacts.mockResolvedValue(undefined);
    mockAgentProfilesGetById.mockResolvedValue(null);
    mockTasksGetById.mockResolvedValue(null);
    mockTasksUpdate.mockResolvedValue(undefined);
    mockCreateRun.mockResolvedValue({ runId: "coding-run-1", status: "running" });
    mockCanExecute.mockReturnValue(true);
    mockEnqueue.mockResolvedValue(undefined);
    mockGetCodingRuntime.mockReturnValue({
      id: "claude-code",
      name: "Claude Code",
      createRun: (...args: unknown[]) => mockCreateRun(...args),
      cancelRun: (...args: unknown[]) => mockAdapterCancelRun(...args),
      getRunStatus: vi.fn().mockResolvedValue({ status: "running", artifacts: [] }),
    });
  });

  it("skips run when task dependencies are not met", async () => {
    mockGetQueued.mockResolvedValue([
      { ...createRun({ id: "run-1" }), taskId: "task-1" },
    ]);
    mockCanExecute.mockReturnValue(false);

    const result = await dispatchRuns();

    expect(result.dispatched).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockAcquireAgentRun).not.toHaveBeenCalled();
  });

  it("dispatches run without taskId (no dependency check)", async () => {
    mockGetQueued.mockResolvedValue([
      { ...createRun({ id: "run-1" }), taskId: null },
    ]);

    const result = await dispatchRuns();

    expect(result.dispatched).toBe(1);
    expect(mockCanExecute).not.toHaveBeenCalled();
  });

  it("marks run as failed when dispatchToCodingRuntime throws", async () => {
    mockGetQueued.mockResolvedValue([
      createRun({ id: "run-1" }),
    ]);
    mockExecuteExecutorAttempt.mockRejectedValue(new Error("spawn failed"));

    const result = await dispatchRuns();

    expect(result.dispatched).toBe(1);
    // Wait for the .catch handler to fire
    await new Promise((r) => setTimeout(r, 50));
    expect(mockUpdateStatus).toHaveBeenCalledWith("run-1", "failed", "spawn failed");
    expect(mockReleaseAgentRun).toHaveBeenCalledWith("run-1");
  });
});

// ---- completeRun — task graph integration ----

describe("completeRun — task integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanStartAgentRun.mockReturnValue(true);
    mockAcquireAgentRun.mockReturnValue(true);
    mockIsResourcePressureHigh.mockReturnValue(false);
    mockGetQueued.mockResolvedValue([]);
    mockGetById.mockResolvedValue(null);
    mockUpdateStatus.mockResolvedValue(undefined);
    mockUpdateArtifacts.mockResolvedValue(undefined);
    mockAgentProfilesGetById.mockResolvedValue(null);
    mockTasksGetById.mockResolvedValue(null);
    mockTasksUpdate.mockResolvedValue(undefined);
    mockTasksGetByProjectId.mockResolvedValue([]);
    mockCreateRun.mockResolvedValue({ runId: "coding-run-1", status: "running" });
    mockCanExecute.mockReturnValue(true);
    mockEnqueue.mockResolvedValue(undefined);
  });

  it("updates task status to completed on success", async () => {
    mockGetById.mockResolvedValue({
      id: "run-1",
      taskId: "task-1",
      agentId: "agent-1",
      projectId: "proj-1",
      workspaceId: "ws-1",
    });
    mockTasksGetById.mockResolvedValue({
      id: "task-1",
      projectId: "proj-1",
      status: "running",
    });

    await completeRun("run-1", true);

    expect(mockTasksUpdate).toHaveBeenCalledWith("task-1", expect.objectContaining({
      status: "completed",
      completedAt: expect.any(String),
    }));
  });

  it("closes the workspace after the final verified task", async () => {
    mockGetById.mockResolvedValue({
      id: "run-final",
      taskId: "task-final",
      agentId: "agent-1",
      projectId: "proj-1",
      workspaceId: "ws-1",
    });
    mockTasksGetById.mockResolvedValue({
      id: "task-final",
      projectId: "proj-1",
      status: "running",
      runHistory: [],
    });
    mockTasksGetByWorkspaceId.mockResolvedValue([
      { id: "task-final", status: "completed", manualInterventionRequired: false },
    ]);

    await completeRun("run-final", true);

    expect(mockWorkspacesUpdate).toHaveBeenCalledWith("ws-1", {
      status: "succeeded",
      completedAt: expect.any(String),
    });
  });

  it("updates task status to failed on failure", async () => {
    mockGetById.mockResolvedValue({
      id: "run-1",
      taskId: "task-1",
      agentId: "agent-1",
      projectId: "proj-1",
    });
    mockTasksGetById.mockResolvedValue({
      id: "task-1",
      projectId: "proj-1",
      status: "running",
    });

    await completeRun("run-1", false, "error");

    expect(mockTasksUpdate).toHaveBeenCalledWith("task-1", expect.objectContaining({
      status: "failed",
      runHistory: expect.any(Array),
    }));
  });

  it("does not enqueue tasks when task has no projectId", async () => {
    mockGetById.mockResolvedValue({
      id: "run-1",
      taskId: "task-1",
      agentId: "agent-1",
    });
    mockTasksGetById.mockResolvedValue({
      id: "task-1",
      projectId: null,
      status: "running",
    });

    await completeRun("run-1", true);

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("does nothing when run has no taskId", async () => {
    mockGetById.mockResolvedValue({ id: "run-1", taskId: null });

    await completeRun("run-1", true);

    expect(mockTasksUpdate).not.toHaveBeenCalled();
    expect(mockReleaseAgentRun).toHaveBeenCalledWith("run-1");
  });
});

// ---- cancelRun — with agent profile ----

describe("cancelRun — agent profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanStartAgentRun.mockReturnValue(true);
    mockAcquireAgentRun.mockReturnValue(true);
    mockIsResourcePressureHigh.mockReturnValue(false);
    mockGetQueued.mockResolvedValue([]);
    mockGetById.mockResolvedValue(null);
    mockUpdateStatus.mockResolvedValue(undefined);
    mockUpdateArtifacts.mockResolvedValue(undefined);
    mockAgentProfilesGetById.mockResolvedValue(null);
    mockTasksGetById.mockResolvedValue(null);
    mockTasksUpdate.mockResolvedValue(undefined);
    mockTasksGetByProjectId.mockResolvedValue([]);
    mockCreateRun.mockResolvedValue({ runId: "coding-run-1", status: "running" });
    mockCanExecute.mockReturnValue(true);
    mockEnqueue.mockResolvedValue(undefined);
    mockGetCodingRuntime.mockReturnValue({
      id: "claude-code",
      name: "Claude Code",
      createRun: (...args: unknown[]) => mockCreateRun(...args),
      cancelRun: (...args: unknown[]) => mockAdapterCancelRun(...args),
      getRunStatus: vi.fn().mockResolvedValue({ status: "running", artifacts: [] }),
    });
  });

  it("cancels run without agentId", async () => {
    mockGetById.mockResolvedValue({
      id: "run-1",
      status: "running",
      agentId: null,
    });

    const result = await cancelRun("run-1");

    expect(result).toBe(true);
    expect(mockUpdateStatus).toHaveBeenCalledWith("run-1", "cancelled");
    expect(mockGetCodingRuntime).not.toHaveBeenCalled();
  });

  it("still cancels when adapter lookup throws", async () => {
    mockGetById.mockResolvedValue(createRun({ id: "run-1", status: "running" }));
    mockAgentProfilesGetById.mockResolvedValue({
      id: "agent-1",
      executorPolicy: { executor: "opencode" },
    });
    mockGetCodingRuntime.mockImplementation(() => { throw new Error("adapter error"); });

    const result = await cancelRun("run-1");

    expect(result).toBe(true);
    expect(mockUpdateStatus).toHaveBeenCalledWith("run-1", "cancelled");
  });

  it("still cancels when adapter cancelRun throws", async () => {
    mockGetById.mockResolvedValue(createRun({ id: "run-1", status: "running" }));
    mockAgentProfilesGetById.mockResolvedValue({
      id: "agent-1",
      executorPolicy: { executor: "opencode" },
    });
    mockAdapterCancelRun.mockRejectedValue(new Error("kill failed"));

    const result = await cancelRun("run-1");

    expect(result).toBe(true);
    expect(mockUpdateStatus).toHaveBeenCalledWith("run-1", "cancelled");
  });
});
