import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
const mockCreateSession = vi.fn();
const mockDisposeSession = vi.fn();

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
  getCodingEnvironment: () => ({
    createSession: (...args: unknown[]) => mockCreateSession(...args),
    dispose: (...args: unknown[]) => mockDisposeSession(...args),
  }),
}));

vi.mock("../../runtimes/coding/verification.js", () => ({
  runVerification: (...args: unknown[]) => mockRunVerification(...args),
}));

const {
  executeExecutorAttempt,
  recoverInterruptedExecutorRuns,
} = await import("../executor-lifecycle-service.js");
const { configureWorktreePolicy } = await import("../worktree-policy.js");

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
  mockCreateSession.mockReset();
  mockDisposeSession.mockReset().mockResolvedValue(undefined);
  mockRunVerification.mockResolvedValue({
    runId: "attempt-1",
    allPassed: true,
    results: [],
    verifiedAt: "2026-07-11T00:00:01.000Z",
    totalDurationMs: 1,
  });
});

afterEach(() => {
  configureWorktreePolicy({ allowedBaseDirs: [], requireWorktreePath: false });
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

describe("executeExecutorAttempt — git worktree isolation", () => {
  let tempRepo: string;

  beforeEach(() => {
    tempRepo = mkdtempSync(join(tmpdir(), "jarvis-wt-test-"));
  });

  afterEach(() => {
    rmSync(tempRepo, { recursive: true, force: true });
  });

  function sessionFixture(overrides: { workingDirectory?: string | null; id?: string } = {}) {
    return {
      id: overrides.id ?? "env-session-1",
      environmentKind: "git-worktree",
      state: "ready" as const,
      workingDirectory:
        overrides.workingDirectory === undefined
          ? join(tempRepo, ".jarvis", "worktrees", "run-abc12345")
          : overrides.workingDirectory,
      workspaceId: "ws-1",
      runId: "attempt-1",
      agentId: "agent-1",
      createdAt: "2026-07-11T00:00:00.000Z",
    };
  }

  it("creates an isolated worktree, executes inside it, and disposes it in finally", async () => {
    const adapter = createAdapter();
    mockGetExecutorAdapter.mockReturnValue(adapter);
    const worktreePath = join(tempRepo, ".jarvis", "worktrees", "run-abc12345");
    mockCreateSession.mockResolvedValue(sessionFixture({ workingDirectory: worktreePath }));

    const result = await executeExecutorAttempt({
      agentRunId: "run-1",
      workspaceId: "ws-1",
      projectId: "project-1",
      taskId: "task-1",
      agentId: "agent-1",
      adapterId: "codex",
      taskPrompt: "Implement it",
      workingDirectory: tempRepo,
      environmentKind: "git-worktree",
      testCommands: ["pnpm test"],
    });

    // Branch derives from the agent run id: agent/<first 8 chars>
    expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({
      environmentKind: "git-worktree",
      workingDirectory: tempRepo,
      metadata: expect.objectContaining({
        branchName: "agent/run-1",
        repoPath: tempRepo,
      }),
    }));
    // The executor is prepared inside the worktree, not the main checkout.
    expect(adapter.prepare).toHaveBeenCalledWith(expect.objectContaining({
      environment: expect.objectContaining({
        kind: "git-worktree",
        workingDirectory: worktreePath,
        metadata: expect.objectContaining({
          sessionId: "env-session-1",
          worktreePath,
          branchName: "agent/run-1",
        }),
      }),
    }));
    // Verification also runs in the worktree.
    expect(mockRunVerification).toHaveBeenCalledWith("attempt-1", expect.objectContaining({
      testCwd: worktreePath,
    }));
    // Persistence records the isolated directory.
    expect(mockExecutorRunUpdate).toHaveBeenCalledWith("attempt-1", {
      workingDirectory: worktreePath,
      environmentConfig: expect.objectContaining({
        sessionId: "env-session-1",
        worktreePath,
        branchName: "agent/run-1",
      }),
    });
    // finally-block disposal — no zombie worktrees.
    expect(mockDisposeSession).toHaveBeenCalledTimes(1);
    expect(mockDisposeSession).toHaveBeenCalledWith("env-session-1");
    expect(result).toMatchObject({ success: true, attemptId: "attempt-1" });
  });

  it("keeps the original directory when the target branch already exists (degrades gracefully)", async () => {
    mockCreateSession.mockRejectedValue(
      new Error("fatal: a branch named 'agent/run-1' already exists"),
    );

    const result = await executeExecutorAttempt({
      agentRunId: "run-1",
      agentId: "agent-1",
      adapterId: "codex",
      taskPrompt: "Implement it",
      workingDirectory: tempRepo,
      testCommands: ["pnpm test"],
    });

    // Degrades to running directly in the repo directory.
    expect(mockRunVerification).toHaveBeenCalledWith("attempt-1", expect.objectContaining({
      testCwd: tempRepo,
    }));
    // No session was created, so nothing must be disposed.
    expect(mockDisposeSession).not.toHaveBeenCalled();
    // The downgrade is auditable.
    expect(mockEventCreate).toHaveBeenCalledWith(expect.objectContaining({
      type: "executor.environment_downgrade",
      payload: expect.objectContaining({
        workingDirectory: tempRepo,
        reason: expect.stringContaining("already exists"),
      }),
    }));
    expect(result.success).toBe(true);
  });

  it("degrades when the working directory is not a git repository", async () => {
    mockCreateSession.mockRejectedValue(new Error("fatal: not a git repository"));

    const result = await executeExecutorAttempt({
      agentRunId: "run-1",
      agentId: "agent-1",
      adapterId: "codex",
      taskPrompt: "Implement it",
      workingDirectory: tempRepo,
      testCommands: ["pnpm test"],
    });

    expect(result.success).toBe(true);
    expect(mockRunVerification).toHaveBeenCalledWith("attempt-1", expect.objectContaining({
      testCwd: tempRepo,
    }));
    expect(mockEventCreate).toHaveBeenCalledWith(expect.objectContaining({
      type: "executor.environment_downgrade",
    }));
  });

  it("fails the attempt when worktree creation fails and policy requires isolation", async () => {
    configureWorktreePolicy({ requireWorktreePath: true });
    mockCreateSession.mockRejectedValue(new Error("disk full — cannot create worktree"));

    const adapter = createAdapter();
    mockGetExecutorAdapter.mockReturnValue(adapter);

    const result = await executeExecutorAttempt({
      agentRunId: "run-1",
      agentId: "agent-1",
      adapterId: "codex",
      taskPrompt: "Implement it",
      workingDirectory: tempRepo,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("disk full");
    // The executor must never start when isolation is mandatory.
    expect(adapter.prepare).not.toHaveBeenCalled();
    expect(mockExecutorRunUpdateStatus).toHaveBeenLastCalledWith(
      "attempt-1",
      "failed",
      expect.stringContaining("disk full"),
    );
  });

  it("disposes the worktree even when the executor fails mid-run", async () => {
    mockCreateSession.mockResolvedValue(sessionFixture());
    const adapter = createAdapter();
    adapter.getStatus = vi.fn().mockResolvedValue({ status: "failed", error: "executor crashed" });
    mockGetExecutorAdapter.mockReturnValue(adapter);

    const result = await executeExecutorAttempt({
      agentRunId: "run-1",
      agentId: "agent-1",
      adapterId: "codex",
      taskPrompt: "Implement it",
      workingDirectory: tempRepo,
    });

    expect(result.success).toBe(false);
    expect(mockDisposeSession).toHaveBeenCalledWith("env-session-1");
  });

  it("disposes the worktree when the executor times out", async () => {
    mockCreateSession.mockResolvedValue(sessionFixture());
    const adapter = createAdapter();
    adapter.getStatus = vi.fn().mockResolvedValue({ status: "running" });
    mockGetExecutorAdapter.mockReturnValue(adapter);

    const result = await executeExecutorAttempt({
      agentRunId: "run-1",
      agentId: "agent-1",
      adapterId: "codex",
      taskPrompt: "Implement it",
      workingDirectory: tempRepo,
      timeoutMs: 50,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("timed out");
    expect(mockDisposeSession).toHaveBeenCalledWith("env-session-1");
  });

  it("does not create a session when the working directory does not exist", async () => {
    const adapter = createAdapter();
    mockGetExecutorAdapter.mockReturnValue(adapter);
    const ghostDir = join(tempRepo, "does", "not", "exist");

    const result = await executeExecutorAttempt({
      agentRunId: "run-1",
      agentId: "agent-1",
      adapterId: "codex",
      taskPrompt: "Implement it",
      workingDirectory: ghostDir,
    });

    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(mockDisposeSession).not.toHaveBeenCalled();
    expect(adapter.prepare).toHaveBeenCalledWith(expect.objectContaining({
      environment: expect.objectContaining({ workingDirectory: ghostDir }),
    }));
    expect(result.success).toBe(true);
  });

  it("does not create a worktree session for non-worktree environment kinds", async () => {
    const adapter = createAdapter();
    mockGetExecutorAdapter.mockReturnValue(adapter);

    const result = await executeExecutorAttempt({
      agentRunId: "run-1",
      agentId: "agent-1",
      adapterId: "codex",
      taskPrompt: "Implement it",
      workingDirectory: tempRepo,
      environmentKind: "host-process",
    });

    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(adapter.prepare).toHaveBeenCalledWith(expect.objectContaining({
      environment: expect.objectContaining({ kind: "host-process", workingDirectory: tempRepo }),
    }));
    expect(result.success).toBe(true);
  });

  it("survives a dispose failure during cleanup without masking the run result", async () => {
    mockCreateSession.mockResolvedValue(sessionFixture());
    mockDisposeSession.mockRejectedValue(new Error("worktree locked by another process"));

    const result = await executeExecutorAttempt({
      agentRunId: "run-1",
      agentId: "agent-1",
      adapterId: "codex",
      taskPrompt: "Implement it",
      workingDirectory: tempRepo,
    });

    expect(result).toMatchObject({ success: true, attemptId: "attempt-1" });
  });

  it("sanitizes environment metadata so injected keys cannot shadow isolation facts", async () => {
    const worktreePath = join(tempRepo, ".jarvis", "worktrees", "run-abc12345");
    mockCreateSession.mockResolvedValue(sessionFixture({ workingDirectory: worktreePath }));

    await executeExecutorAttempt({
      agentRunId: "run-1",
      agentId: "agent-1",
      adapterId: "codex",
      taskPrompt: "Implement it",
      workingDirectory: tempRepo,
      environmentMetadata: {
        branchName: "attacker/override",
        sessionId: "attacker-session",
        worktreePath: "C:/Windows/System32",
      },
      testCommands: ["pnpm test"],
    });

    expect(mockRunVerification).toHaveBeenCalledWith("attempt-1", expect.objectContaining({
      testCwd: worktreePath,
    }));
    expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        branchName: "agent/run-1",
        repoPath: tempRepo,
        sessionId: "attacker-session",
      }),
    }));
  });
});
