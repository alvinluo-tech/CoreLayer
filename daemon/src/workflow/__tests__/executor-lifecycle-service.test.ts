import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutorAdapter, ExecutorEvent } from "@jarvis/runtime-protocol";

const mockExecutorRunCreate = vi.fn();
const mockExecutorRunUpdate = vi.fn();
const mockExecutorRunUpdateStatus = vi.fn();
const mockExecutorRunGetActive = vi.fn();
const mockExecutorRunGetByAgentRun = vi.fn();
const mockAgentRunUpdateStatus = vi.fn();
const mockAgentRunGetById = vi.fn();
const mockTaskUpdate = vi.fn();
const mockEventCreate = vi.fn();
const mockGetExecutorAdapter = vi.fn();
const mockRunVerification = vi.fn();

vi.mock("../../persistence/factory.js", () => ({
  getRepositories: () => ({
    executorRuns: {
      create: mockExecutorRunCreate,
      update: mockExecutorRunUpdate,
      updateStatus: mockExecutorRunUpdateStatus,
      getActive: mockExecutorRunGetActive,
      getByAgentRun: mockExecutorRunGetByAgentRun,
    },
    agentRuns: {
      updateStatus: mockAgentRunUpdateStatus,
      getById: mockAgentRunGetById,
    },
    tasks: { update: mockTaskUpdate },
    agentRunEvents: { create: mockEventCreate },
  }),
}));

vi.mock("../../runtimes/coding/public-api.js", () => ({
  getExecutorAdapter: (...args: unknown[]) => mockGetExecutorAdapter(...args),
  selectExecutorAdapter: vi.fn(),
}));

vi.mock("../../runtimes/coding/verification.js", () => ({
  runVerification: (...args: unknown[]) => mockRunVerification(...args),
}));

const {
  executeExecutorAttempt,
  recoverInterruptedExecutorRuns,
} = await import("../executor-lifecycle-service.js");

function events(items: ExecutorEvent[]): AsyncIterable<ExecutorEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      yield* items;
    },
  };
}

function createAdapter(): ExecutorAdapter {
  return {
    id: "codex",
    displayName: "Codex",
    discover: vi.fn().mockResolvedValue({ available: true, transport: "cli" }),
    getCapabilities: vi.fn().mockReturnValue({
      adapterId: "codex",
      domain: "coding",
      nonInteractive: true,
      streamEvents: true,
      structuredOutput: true,
      permissionMode: true,
      toolConfigInjection: true,
      isolatedEnvironment: true,
      cancellation: true,
      resumableSession: false,
      permissionProjection: "stdout-pattern",
      approvalResumeStrategy: "manual_block",
      defaultTimeoutMs: 300_000,
    }),
    prepare: vi.fn().mockResolvedValue({
      runId: "attempt-1",
      adapterId: "codex",
      status: "running",
      startedAt: "2026-07-11T00:00:00.000Z",
    }),
    start: vi.fn(async (handle) => handle),
    streamEvents: vi.fn(() => events([
      { type: "executor.started", runId: "attempt-1", timestamp: "2026-07-11T00:00:00.000Z" },
      { type: "executor.completed", runId: "attempt-1", timestamp: "2026-07-11T00:00:01.000Z" },
    ])),
    getStatus: vi.fn().mockResolvedValue({ status: "succeeded" }),
    requestCancel: vi.fn().mockResolvedValue(undefined),
    collectArtifacts: vi.fn().mockResolvedValue({
      runId: "attempt-1",
      artifacts: [{ type: "changed_files", content: "src/a.ts" }],
      finalSummary: "done",
    }),
    cleanup: vi.fn().mockResolvedValue(undefined),
  };
}

const attemptRow = {
  id: "attempt-1",
  agentRunId: "run-1",
  workspaceId: "ws-1",
  projectId: "project-1",
  taskId: "task-1",
  agentId: "agent-1",
  adapterId: "codex",
  domain: "coding",
  status: "created",
  taskPrompt: "Implement it",
  environmentKind: "git-worktree",
  environmentConfig: {},
  workingDirectory: "C:/repo",
  pid: null,
  exitCode: null,
  error: null,
  failureCategory: null,
  timeoutMs: 300_000,
  artifacts: {},
  startedAt: "2026-07-11T00:00:00.000Z",
  completedAt: null,
  durationMs: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockExecutorRunCreate.mockResolvedValue(attemptRow);
  mockExecutorRunUpdate.mockResolvedValue(undefined);
  mockExecutorRunUpdateStatus.mockResolvedValue(undefined);
  mockExecutorRunGetActive.mockResolvedValue([]);
  mockExecutorRunGetByAgentRun.mockResolvedValue([]);
  mockAgentRunUpdateStatus.mockResolvedValue(undefined);
  mockAgentRunGetById.mockResolvedValue(null);
  mockTaskUpdate.mockResolvedValue(undefined);
  mockEventCreate.mockResolvedValue({});
  mockGetExecutorAdapter.mockReturnValue(createAdapter());
  mockRunVerification.mockResolvedValue({
    runId: "attempt-1",
    allPassed: true,
    results: [],
    verifiedAt: "2026-07-11T00:00:01.000Z",
    totalDurationMs: 1,
  });
});

describe("executeExecutorAttempt", () => {
  it("persists one executor attempt and completes only after verification", async () => {
    const result = await executeExecutorAttempt({
      agentRunId: "run-1",
      workspaceId: "ws-1",
      projectId: "project-1",
      taskId: "task-1",
      agentId: "agent-1",
      adapterId: "codex",
      taskPrompt: "Implement it",
      workingDirectory: "C:/repo",
      testCommands: ["pnpm test"],
    });

    expect(mockExecutorRunCreate).toHaveBeenCalledWith(expect.objectContaining({
      agentRunId: "run-1",
      adapterId: "codex",
      taskPrompt: "Implement it",
    }));
    expect(mockRunVerification).toHaveBeenCalledWith("attempt-1", expect.objectContaining({
      testCommand: "pnpm test",
      testCwd: "C:/repo",
    }));
    expect(mockExecutorRunUpdateStatus.mock.calls.map((call) => call[1])).toEqual([
      "preparing_environment",
      "running",
      "collecting_artifacts",
      "verifying",
      "succeeded",
    ]);
    expect(result).toMatchObject({ success: true, attemptId: "attempt-1" });
  });

  it("fails the attempt when objective verification fails", async () => {
    mockRunVerification.mockResolvedValue({
      runId: "attempt-1",
      allPassed: false,
      results: [{ checkName: "test-command", passed: false, summary: "failed", severity: "error" }],
      verifiedAt: "2026-07-11T00:00:01.000Z",
      totalDurationMs: 1,
    });

    const result = await executeExecutorAttempt({
      agentRunId: "run-1",
      adapterId: "codex",
      agentId: "agent-1",
      taskPrompt: "Implement it",
      workingDirectory: "C:/repo",
      testCommands: ["pnpm test"],
    });

    expect(result.success).toBe(false);
    expect(mockExecutorRunUpdateStatus).toHaveBeenLastCalledWith(
      "attempt-1",
      "failed",
      expect.stringContaining("Verification failed"),
    );
  });
});

describe("recoverInterruptedExecutorRuns", () => {
  it("fails orphaned attempts and marks their tasks for manual intervention", async () => {
    mockExecutorRunGetActive.mockResolvedValue([{ ...attemptRow, status: "running" }]);
    mockAgentRunGetById.mockResolvedValue({ id: "run-1", taskId: "task-1", status: "running" });

    await expect(recoverInterruptedExecutorRuns()).resolves.toBe(1);

    expect(mockExecutorRunUpdateStatus).toHaveBeenCalledWith(
      "attempt-1",
      "failed",
      expect.stringContaining("Daemon restarted"),
    );
    expect(mockAgentRunUpdateStatus).toHaveBeenCalledWith(
      "run-1",
      "failed",
      expect.stringContaining("manual intervention"),
    );
    expect(mockTaskUpdate).toHaveBeenCalledWith("task-1", {
      status: "blocked",
      manualInterventionRequired: true,
    });
  });
});
