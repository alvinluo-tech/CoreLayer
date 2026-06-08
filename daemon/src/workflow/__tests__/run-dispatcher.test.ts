/**
 * Unit tests for the Run Dispatcher.
 *
 * Tests the dispatchRuns, completeRun, cancelRun, retryRun, and getDispatcherStatus
 * functions. Mocks the persistence layer, slot manager, and resource monitor.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---- Mocks ----

const mockGetRecent = vi.fn();
const mockUpdateStatus = vi.fn();
const mockGetById = vi.fn();

vi.mock("../../persistence/factory.js", () => ({
  getRepositories: vi.fn(() => ({
    agentRuns: {
      getRecent: (...args: unknown[]) => mockGetRecent(...args),
      updateStatus: (...args: unknown[]) => mockUpdateStatus(...args),
      getById: (...args: unknown[]) => mockGetById(...args),
    },
  })),
}));

vi.mock("../../runtimes/coding/process-spawner.js", () => ({
  getActiveProcessCount: vi.fn(() => 0),
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

// Import after mocks are set up
const { dispatchRuns, completeRun, cancelRun, retryRun, getDispatcherStatus } = await import("../run-dispatcher.js");

// ---- Helpers ----

function createRun(overrides: { id?: string; status?: string; completedAt?: string | null } = {}) {
  return {
    id: overrides.id ?? "run-1",
    status: overrides.status ?? "running",
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
  mockGetById.mockResolvedValue(null);
  mockUpdateStatus.mockResolvedValue(undefined);
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
    mockGetRecent.mockResolvedValue([]);

    const result = await dispatchRuns();

    expect(result.dispatched).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it("dispatches pending runs when slots are available", async () => {
    mockGetRecent.mockResolvedValue([
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

    mockGetRecent.mockResolvedValue([
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
    expect(mockGetRecent).not.toHaveBeenCalled();
  });

  it("returns early when no slots available", async () => {
    mockCanStartAgentRun.mockReturnValue(false);

    const result = await dispatchRuns();

    expect(result.dispatched).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.reason).toBe("All agent run slots occupied");
    expect(mockGetRecent).not.toHaveBeenCalled();
  });

  it("filters out completed runs from pending list", async () => {
    mockGetRecent.mockResolvedValue([
      createRun({ id: "run-1", status: "running" }),
      createRun({ id: "run-2", status: "succeeded", completedAt: "2026-01-01T00:00:00Z" }),
      createRun({ id: "run-3", status: "running" }),
    ]);
    mockAcquireAgentRun.mockReturnValue(true);

    const result = await dispatchRuns();

    // Only run-1 and run-3 are pending (running without completedAt)
    expect(result.dispatched).toBe(2);
    expect(mockAcquireAgentRun).not.toHaveBeenCalledWith("run-2");
  });

  it("does not update queue depth when no pending runs", async () => {
    mockGetRecent.mockResolvedValue([]);
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

    mockGetRecent.mockResolvedValue([
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
    mockGetRecent.mockResolvedValue([
      createRun({ id: "run-1" }),
      createRun({ id: "run-2" }),
    ]);

    // When canStartAgentRun is false, it returns early before setting queue depth
    const result = await dispatchRuns();

    expect(result.reason).toBe("All agent run slots occupied");
  });

  it("returns zero dispatched when acquireAgentRun fails", async () => {
    mockGetRecent.mockResolvedValue([createRun({ id: "run-1" })]);
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
  it("retries a failed run by resetting to running", async () => {
    mockGetById.mockResolvedValue(createRun({ id: "run-1", status: "failed" }));

    const result = await retryRun("run-1");

    expect(result).toBe(true);
    expect(mockUpdateStatus).toHaveBeenCalledWith("run-1", "running");
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
