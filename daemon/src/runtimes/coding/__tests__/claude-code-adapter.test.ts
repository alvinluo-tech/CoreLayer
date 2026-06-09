/**
 * Unit tests for the ClaudeCodeAdapter coding runtime.
 *
 * Covers: failure paths, success paths, cancellation, artifact collection,
 * permission denial, timeout configuration, and process completion callbacks.
 *
 * Uses vi.spyOn on imported modules instead of vi.mock to avoid vitest
 * module resolution issues with .js extensions and pnpm symlinks.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";

import { ClaudeCodeAdapter } from "../claude-code-adapter.js";
import * as processSpawner from "../process-spawner.js";
import * as capabilityBroker from "../../../capabilities/os-capability-broker.js";
import * as auditLog from "../../../persistence/audit-log.js";
import * as artifactPersistence from "../artifact-persistence.js";
import * as persistenceFactory from "../../../persistence/factory.js";

// ---- Helpers ----

function makeTask(overrides?: { repoPath?: string; timeoutMs?: number }) {
  return {
    repoPath: overrides?.repoPath ?? "/home/user/my-repo",
    taskPrompt: "Fix the bug in main.ts",
    timeoutMs: overrides?.timeoutMs,
  };
}

function makeMockProcess() {
  const emitter = new EventEmitter();
  const listeners: Record<string, (...args: unknown[]) => void> = {};

  const originalOn = emitter.on.bind(emitter);
  emitter.on = vi.fn((event: string, fn: (...args: unknown[]) => void) => {
    listeners[event] = fn;
    return originalOn(event, fn);
  }) as unknown as typeof emitter.on;

  return {
    process: emitter,
    listeners,
    emitClose(code: number | null) {
      listeners["close"]?.(code);
    },
    emitError(err: Error) {
      listeners["error"]?.(err);
    },
  };
}

function makeMockHandle(mockProcess: ReturnType<typeof makeMockProcess>) {
  return {
    pid: 12345,
    process: mockProcess.process,
    stdout: [] as string[],
    stderr: [] as string[],
    exitCode: null as number | null,
    killed: false,
  };
}

// ---- Tests ----

describe("ClaudeCodeAdapter", () => {
  let adapter: ClaudeCodeAdapter;

  beforeEach(() => {
    adapter = new ClaudeCodeAdapter();
    vi.clearAllMocks();

    // Default mocks: command not available, workdir allowed, broker allows
    vi.spyOn(processSpawner, "isCommandAvailable").mockReturnValue(false);
    vi.spyOn(processSpawner, "validateWorkdirPolicy").mockReturnValue({ allowed: true });
    vi.spyOn(processSpawner, "spawnProcessLive").mockReturnValue({
      pid: 12345,
      process: new EventEmitter(),
      stdout: [],
      stderr: [],
      exitCode: null,
      killed: false,
    } as any);
    vi.spyOn(processSpawner, "killProcessTree").mockImplementation(() => {});

    vi.spyOn(capabilityBroker, "getCapabilityBroker").mockReturnValue({
      requestShellExec: vi.fn(async () => ({
        decision: "allow" as const,
        reason: "",
      })),
    } as any);

    vi.spyOn(auditLog, "logAuditEntry").mockResolvedValue(undefined as any);
    vi.spyOn(artifactPersistence, "persistArtifacts").mockImplementation(() => {});

    vi.spyOn(persistenceFactory, "getRepositories").mockReturnValue({
      agentRuns: { updateArtifacts: vi.fn(async () => {}) },
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Metadata
  // =========================================================================

  describe("adapter metadata", () => {
    it("exposes correct id and name", () => {
      expect(adapter.id).toBe("claude-code");
      expect(adapter.name).toBe("Claude Code");
    });
  });

  // =========================================================================
  // createRun — command not found
  // =========================================================================

  describe("createRun — command not found", () => {
    it("returns failed run when claude CLI is missing", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(false);

      const run = await adapter.createRun(makeTask());

      expect(run.status).toBe("failed");
      expect(run.adapterId).toBe("claude-code");
      expect(run.error).toContain("Claude Code CLI not found on PATH");
      expect(run.artifacts).toHaveLength(1);
      expect(run.artifacts[0].type).toBe("error");
      expect(run.artifacts[0].content).toContain("Claude Code CLI not found");
      expect(run.completedAt).toBeDefined();
    });

    it("does not spawn a process when claude CLI is missing", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(false);

      await adapter.createRun(makeTask());

      expect(processSpawner.spawnProcessLive).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // createRun — missing repoPath
  // =========================================================================

  describe("createRun — missing repoPath", () => {
    it("returns failed run when repoPath is empty", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      const run = await adapter.createRun(makeTask({ repoPath: "" }));

      expect(run.status).toBe("failed");
      expect(run.error).toBe("repoPath is required but was not provided");
      expect(run.artifacts).toHaveLength(1);
      expect(run.artifacts[0].content).toContain("repoPath is required");
      expect(run.completedAt).toBeDefined();
    });

    it("does not spawn a process when repoPath is missing", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      await adapter.createRun(makeTask({ repoPath: "" }));

      expect(processSpawner.spawnProcessLive).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // createRun — worktree policy violation
  // =========================================================================

  describe("createRun — worktree policy violation", () => {
    it("returns failed run when working directory is blocked", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);
      (processSpawner.validateWorkdirPolicy as any).mockReturnValue({
        allowed: false,
        reason: "Working directory is within a blocked system path: /usr",
      });

      const run = await adapter.createRun(makeTask());

      expect(run.status).toBe("failed");
      expect(run.error).toBe("Working directory is within a blocked system path: /usr");
      expect(processSpawner.spawnProcessLive).not.toHaveBeenCalled();
      expect(auditLog.logAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: "denied",
          action: "run.start",
        }),
      );
    });
  });

  // =========================================================================
  // createRun — permission denied
  // =========================================================================

  describe("createRun — permission denied", () => {
    it("returns failed run when broker denies shell execution", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);
      const mockBroker = {
        requestShellExec: vi.fn(async () => ({
          decision: "deny" as const,
          reason: "Shell execution not permitted by policy",
        })),
      };
      (capabilityBroker.getCapabilityBroker as any).mockReturnValue(mockBroker as any);

      const run = await adapter.createRun(makeTask());

      expect(run.status).toBe("failed");
      expect(run.error).toContain("Shell execution not permitted");
      expect(run.artifacts).toHaveLength(1);
      expect(run.artifacts[0].type).toBe("error");
      expect(run.artifacts[0].content).toContain("Permission denied");
    });

    it("does not spawn a process when permission is denied", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);
      (capabilityBroker.getCapabilityBroker as any).mockReturnValue({
        requestShellExec: vi.fn(async () => ({
          decision: "deny" as const,
          reason: "No",
        })),
      } as any);

      await adapter.createRun(makeTask());

      expect(processSpawner.spawnProcessLive).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // createRun — approval required
  // =========================================================================

  describe("createRun — approval required", () => {
    it("returns pending run when broker requests approval", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);
      (capabilityBroker.getCapabilityBroker as any).mockReturnValue({
        requestShellExec: vi.fn(async () => ({
          decision: "approval_required" as const,
          reason: "User approval needed",
        })),
      } as any);

      const run = await adapter.createRun(makeTask());

      expect(run.status).toBe("pending");
      expect(run.error).toBeUndefined();
      expect(run.artifacts).toHaveLength(0);
    });

    it("does not spawn a process when approval is required", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);
      (capabilityBroker.getCapabilityBroker as any).mockReturnValue({
        requestShellExec: vi.fn(async () => ({
          decision: "approval_required" as const,
          reason: "Pending approval",
        })),
      } as any);

      await adapter.createRun(makeTask());

      expect(processSpawner.spawnProcessLive).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // createRun — success path
  // =========================================================================

  describe("createRun — success path", () => {
    it("returns running run with correct structure", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      const run = await adapter.createRun(makeTask());

      expect(run.runId).toBeDefined();
      expect(typeof run.runId).toBe("string");
      expect(run.runId.length).toBeGreaterThan(0);
      expect(run.adapterId).toBe("claude-code");
      expect(run.status).toBe("running");
      expect(run.task.taskPrompt).toBe("Fix the bug in main.ts");
      expect(run.startedAt).toBeDefined();
      expect(run.completedAt).toBeUndefined();
      expect(run.artifacts).toHaveLength(0);
    });

    it("spawns a subprocess via spawnProcessLive", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      await adapter.createRun(makeTask());

      expect(processSpawner.spawnProcessLive).toHaveBeenCalledTimes(1);
    });

    it("passes correct command and args to spawnProcessLive", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      await adapter.createRun(makeTask());

      expect(processSpawner.spawnProcessLive).toHaveBeenCalledWith(
        expect.objectContaining({
          command: "claude",
          args: ["--print", "Fix the bug in main.ts"],
        }),
      );
    });

    it("passes repoPath as cwd when no worktreePath is set", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      await adapter.createRun(makeTask({ repoPath: "/home/user/repo" }));

      expect(processSpawner.spawnProcessLive).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: "/home/user/repo" }),
      );
    });

    it("passes worktreePath as cwd when worktreePath is set", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      await adapter.createRun({
        repoPath: "/home/user/repo",
        worktreePath: "/tmp/worktree-abc",
        taskPrompt: "Refactor utils",
      });

      expect(processSpawner.spawnProcessLive).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: "/tmp/worktree-abc" }),
      );
    });

    it("logs audit entry on successful run start", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      await adapter.createRun(makeTask());

      expect(auditLog.logAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: "user",
          action: "run.start",
          decision: "allowed",
        }),
      );
    });
  });

  // =========================================================================
  // Timeout configuration
  // =========================================================================

  describe("timeout handling", () => {
    it("passes custom timeoutMs to spawnProcessLive", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      await adapter.createRun(makeTask({ timeoutMs: 60_000 }));

      expect(processSpawner.spawnProcessLive).toHaveBeenCalledWith(
        expect.objectContaining({ timeoutMs: 60_000 }),
      );
    });

    it("uses default 300s timeout when timeoutMs is not provided", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      await adapter.createRun(makeTask());

      expect(processSpawner.spawnProcessLive).toHaveBeenCalledWith(
        expect.objectContaining({ timeoutMs: 300_000 }),
      );
    });
  });

  // =========================================================================
  // getRunStatus
  // =========================================================================

  describe("getRunStatus", () => {
    it("returns run info for an existing failed run", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(false);

      const created = await adapter.createRun(makeTask());
      const status = await adapter.getRunStatus(created.runId);

      expect(status.runId).toBe(created.runId);
      expect(status.status).toBe("failed");
      expect(status.adapterId).toBe("claude-code");
    });

    it("throws for a nonexistent run", async () => {
      await expect(
        adapter.getRunStatus("nonexistent-run-id-00000000"),
      ).rejects.toThrow("Coding run not found: nonexistent-run-id-00000000");
    });
  });

  // =========================================================================
  // cancelRun
  // =========================================================================

  describe("cancelRun", () => {
    it("returns false for a nonexistent run", async () => {
      const result = await adapter.cancelRun("nonexistent-run-id-00000000");
      expect(result).toBe(false);
    });

    it("returns false for a failed (non-running) run", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(false);

      const run = await adapter.createRun(makeTask());
      const result = await adapter.cancelRun(run.runId);

      expect(result).toBe(false);
    });

    it("returns false for a completed succeeded run", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      const mock = makeMockProcess();
      (processSpawner.spawnProcessLive as any).mockReturnValue(makeMockHandle(mock));

      const run = await adapter.createRun(makeTask());

      // Simulate process completing successfully
      mock.emitClose(0);

      const cancelled = await adapter.cancelRun(run.runId);
      expect(cancelled).toBe(false);
    });

    it("cancels a running run and updates status", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      const mock = makeMockProcess();
      (processSpawner.spawnProcessLive as any).mockReturnValue(makeMockHandle(mock));

      const run = await adapter.createRun(makeTask());
      expect(run.status).toBe("running");

      const result = await adapter.cancelRun(run.runId);

      expect(result).toBe(true);

      const status = await adapter.getRunStatus(run.runId);
      expect(status.status).toBe("cancelled");
      expect(status.completedAt).toBeDefined();
      expect(status.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("calls killProcessTree with the tracked PID on cancel", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      const mock = makeMockProcess();
      (processSpawner.spawnProcessLive as any).mockReturnValue(makeMockHandle(mock));

      const run = await adapter.createRun(makeTask());
      await adapter.cancelRun(run.runId);

      expect(processSpawner.killProcessTree).toHaveBeenCalledWith(12345);
    });

    it("logs audit entry on cancel", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      const mock = makeMockProcess();
      (processSpawner.spawnProcessLive as any).mockReturnValue(makeMockHandle(mock));

      const run = await adapter.createRun(makeTask());
      await adapter.cancelRun(run.runId);

      expect(auditLog.logAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: "user",
          action: "run.cancel",
          decision: "allowed",
        }),
      );
    });

    it("cancels a pending (approval_required) run", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);
      (capabilityBroker.getCapabilityBroker as any).mockReturnValue({
        requestShellExec: vi.fn(async () => ({
          decision: "approval_required" as const,
          reason: "Awaiting user",
        })),
      } as any);

      const run = await adapter.createRun(makeTask());
      expect(run.status).toBe("pending");

      const result = await adapter.cancelRun(run.runId);

      expect(result).toBe(true);
      const status = await adapter.getRunStatus(run.runId);
      expect(status.status).toBe("cancelled");
    });
  });

  // =========================================================================
  // collectArtifacts
  // =========================================================================

  describe("collectArtifacts", () => {
    it("returns error artifact for a failed run (command not found)", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(false);

      const run = await adapter.createRun(makeTask());
      const artifacts = await adapter.collectArtifacts(run.runId);

      expect(Array.isArray(artifacts)).toBe(true);
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].type).toBe("error");
    });

    it("returns empty artifacts for a freshly created running run", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      const run = await adapter.createRun(makeTask());
      const artifacts = await adapter.collectArtifacts(run.runId);

      expect(Array.isArray(artifacts)).toBe(true);
      expect(artifacts).toHaveLength(0);
    });

    it("returns final_summary after process exits with code 0", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      const mock = makeMockProcess();
      const handle = makeMockHandle(mock);
      handle.stdout = ["Task completed successfully"];
      (processSpawner.spawnProcessLive as any).mockReturnValue(handle);

      const run = await adapter.createRun(makeTask());
      mock.emitClose(0);

      const artifacts = await adapter.collectArtifacts(run.runId);
      expect(artifacts.length).toBeGreaterThanOrEqual(1);

      const summary = artifacts.find((a) => a.type === "final_summary");
      expect(summary).toBeDefined();
      expect(summary!.content).toBe("Task completed successfully");
    });

    it("returns error artifact after process exits with non-zero code", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      const mock = makeMockProcess();
      const handle = makeMockHandle(mock);
      handle.stderr = ["Error: API rate limit exceeded"];
      (processSpawner.spawnProcessLive as any).mockReturnValue(handle);

      const run = await adapter.createRun(makeTask());
      mock.emitClose(1);

      const artifacts = await adapter.collectArtifacts(run.runId);
      expect(artifacts.length).toBeGreaterThanOrEqual(1);

      const errorArtifact = artifacts.find((a) => a.type === "error");
      expect(errorArtifact).toBeDefined();
      expect(errorArtifact!.content).toContain("API rate limit exceeded");
    });

    it("returns error artifact after process error event", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      const mock = makeMockProcess();
      (processSpawner.spawnProcessLive as any).mockReturnValue(makeMockHandle(mock));

      const run = await adapter.createRun(makeTask());
      mock.emitError(new Error("ENOENT: claude not found"));

      const artifacts = await adapter.collectArtifacts(run.runId);
      expect(artifacts.length).toBeGreaterThanOrEqual(1);

      const errorArtifact = artifacts.find((a) => a.type === "error");
      expect(errorArtifact).toBeDefined();
      expect(errorArtifact!.content).toContain("ENOENT");
    });

    it("persists artifacts after process exits", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      const mock = makeMockProcess();
      (processSpawner.spawnProcessLive as any).mockReturnValue(makeMockHandle(mock));

      await adapter.createRun(makeTask());
      mock.emitClose(0);

      // Allow microtask queue to flush
      await new Promise((r) => setTimeout(r, 10));

      expect(artifactPersistence.persistArtifacts).toHaveBeenCalled();
    });

    it("throws for a nonexistent run", async () => {
      await expect(
        adapter.collectArtifacts("nonexistent-run-id-00000000"),
      ).rejects.toThrow("Coding run not found: nonexistent-run-id-00000000");
    });
  });

  // =========================================================================
  // Process completion callbacks
  // =========================================================================

  describe("process completion callbacks", () => {
    it("updates run to succeeded on exit code 0", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      const mock = makeMockProcess();
      (processSpawner.spawnProcessLive as any).mockReturnValue(makeMockHandle(mock));

      const run = await adapter.createRun(makeTask());
      expect(run.status).toBe("running");

      mock.emitClose(0);

      const status = await adapter.getRunStatus(run.runId);
      expect(status.status).toBe("succeeded");
      expect(status.completedAt).toBeDefined();
      expect(status.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("updates run to failed on non-zero exit code", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      const mock = makeMockProcess();
      const handle = makeMockHandle(mock);
      handle.stderr = ["segfault at address 0x0"];
      (processSpawner.spawnProcessLive as any).mockReturnValue(handle);

      const run = await adapter.createRun(makeTask());
      mock.emitClose(1);

      const status = await adapter.getRunStatus(run.runId);
      expect(status.status).toBe("failed");
      expect(status.error).toContain("segfault");
    });

    it("uses stderr as error when exit code is non-zero and stderr is empty", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      const mock = makeMockProcess();
      const handle = makeMockHandle(mock);
      handle.stderr = [];
      (processSpawner.spawnProcessLive as any).mockReturnValue(handle);

      const run = await adapter.createRun(makeTask());
      mock.emitClose(2);

      const status = await adapter.getRunStatus(run.runId);
      expect(status.status).toBe("failed");
      expect(status.error).toBe("Exit code 2");
    });

    it("uses stdout as final_summary when stdout is non-empty on success", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      const mock = makeMockProcess();
      const handle = makeMockHandle(mock);
      handle.stdout = ["All tests passed", "Coverage: 95%"];
      (processSpawner.spawnProcessLive as any).mockReturnValue(handle);

      const run = await adapter.createRun(makeTask());
      mock.emitClose(0);

      const artifacts = await adapter.collectArtifacts(run.runId);
      const summary = artifacts.find((a) => a.type === "final_summary");
      expect(summary!.content).toBe("All tests passedCoverage: 95%");
    });

    it("uses default message when stdout is empty on success", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      const mock = makeMockProcess();
      const handle = makeMockHandle(mock);
      handle.stdout = [];
      (processSpawner.spawnProcessLive as any).mockReturnValue(handle);

      const run = await adapter.createRun(makeTask());
      mock.emitClose(0);

      const artifacts = await adapter.collectArtifacts(run.runId);
      const summary = artifacts.find((a) => a.type === "final_summary");
      expect(summary!.content).toBe("Task completed successfully");
    });

    it("marks run as failed on process error event", async () => {
      (processSpawner.isCommandAvailable as any).mockReturnValue(true);

      const mock = makeMockProcess();
      (processSpawner.spawnProcessLive as any).mockReturnValue(makeMockHandle(mock));

      const run = await adapter.createRun(makeTask());
      mock.emitError(new Error("spawn claude ENOENT"));

      const status = await adapter.getRunStatus(run.runId);
      expect(status.status).toBe("failed");
      expect(status.completedAt).toBeDefined();
      expect(status.error).toContain("spawn claude ENOENT");
    });
  });
});
