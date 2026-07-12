import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";

// Test file: src/runtimes/coding/adapters/opencode/__tests__/cli-adapter.test.ts
// Source file: src/runtimes/coding/adapters/opencode/cli-adapter.ts
// Source imports from src/runtimes/coding/... — need one extra "../" from __tests__/

vi.mock("../../../../../capabilities/os-capability-broker.js", () => ({
  getCapabilityBroker: vi.fn(),
}));

vi.mock("../../../../../persistence/audit-log.js", () => ({
  logAuditEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../artifact-persistence.js", () => ({
  persistArtifacts: vi.fn(),
}));

vi.mock("../../../../../persistence/factory.js", () => ({
  getRepositories: vi.fn(),
}));

vi.mock("../../../../../services/workspace-event-emitter.js", () => ({
  emitWorkspaceEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../../../shared/secret-masking.js", () => ({
  maskObjectSecrets: (obj: Record<string, unknown>) => obj,
}));

vi.mock("../config-writer.js", () => ({
  createRunConfig: vi.fn().mockReturnValue("/tmp/jarvis-run/opencode.json"),
}));

vi.mock("../../../events/normalize-event.js", () => ({
  CodingEventEmitter: vi.fn().mockImplementation(() => ({
    emit: vi.fn(),
    createStream: vi.fn().mockReturnValue({
      iterable: {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: true, value: undefined }),
          return: async () => ({ done: true, value: undefined }),
        }),
      },
    }),
    cleanup: vi.fn(),
  })),
}));

const mockIsCommandAvailable = vi.fn().mockReturnValue(false);
const mockValidateWorkdirPolicy = vi.fn().mockReturnValue({ allowed: true });
const mockSpawnProcessLive = vi.fn();
const mockKillProcessTree = vi.fn();

vi.mock("../../../process-spawner.js", () => ({
  isCommandAvailable: (...args: unknown[]) => mockIsCommandAvailable(...args),
  validateWorkdirPolicy: (...args: unknown[]) => mockValidateWorkdirPolicy(...args),
  spawnProcessLive: (...args: unknown[]) => mockSpawnProcessLive(...args),
  killProcessTree: (...args: unknown[]) => mockKillProcessTree(...args),
}));

import { OpenCodeCliAdapter } from "../cli-adapter.js";
import * as capabilityBroker from "../../../../../capabilities/os-capability-broker.js";
import * as persistenceFactory from "../../../../../persistence/factory.js";
import * as workspaceEventEmitter from "../../../../../services/workspace-event-emitter.js";
import * as configWriter from "../config-writer.js";

function makeTask(overrides?: { repoPath?: string; worktreePath?: string; dbRunId?: string }) {
  return {
    repoPath: overrides?.repoPath ?? "/home/user/my-repo",
    worktreePath: overrides?.worktreePath,
    taskPrompt: "Fix the bug in main.ts",
    dbRunId: overrides?.dbRunId,
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

function makeMockHandle(mockProc: ReturnType<typeof makeMockProcess>) {
  return {
    pid: 12345,
    process: mockProc.process,
    stdout: [] as string[],
    stderr: [] as string[],
    exitCode: null as number | null,
    killed: false,
  };
}

describe("OpenCodeCliAdapter", () => {
  let adapter: OpenCodeCliAdapter;

  beforeEach(() => {
    adapter = new OpenCodeCliAdapter();
    vi.clearAllMocks();

    mockIsCommandAvailable.mockReturnValue(false);
    mockValidateWorkdirPolicy.mockReturnValue({ allowed: true });
    mockSpawnProcessLive.mockReturnValue({
      pid: 12345,
      process: new EventEmitter(),
      stdout: [],
      stderr: [],
      exitCode: null,
      killed: false,
    });
    mockKillProcessTree.mockImplementation(() => {});

    vi.mocked(capabilityBroker.getCapabilityBroker).mockReturnValue({
      requestShellExec: vi.fn(async () => ({ decision: "allow" as const, reason: "" })),
    } as any);

    vi.mocked(persistenceFactory.getRepositories).mockReturnValue({
      agentRuns: { updateArtifacts: vi.fn(async () => {}) },
      eventLog: { create: vi.fn(async () => {}) },
    } as any);

    vi.mocked(workspaceEventEmitter.emitWorkspaceEvent).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setupDefaultMocks() {
    mockIsCommandAvailable.mockReturnValue(true);
    vi.mocked(capabilityBroker.getCapabilityBroker).mockReturnValue({
      requestShellExec: vi.fn(async () => ({ decision: "allow" as const, reason: "" })),
    } as any);
    vi.mocked(persistenceFactory.getRepositories).mockReturnValue({
      agentRuns: { updateArtifacts: vi.fn(async () => {}) },
      eventLog: { create: vi.fn(async () => {}) },
    } as any);
  }

  describe("adapter metadata", () => {
    it("exposes correct id and name", () => {
      expect(adapter.id).toBe("opencode");
      expect(adapter.name).toBe("OpenCode");
      expect(adapter.displayName).toBe("OpenCode");
    });
  });

  describe("discover", () => {
    it("returns unavailable when opencode not on PATH", async () => {
      mockIsCommandAvailable.mockReturnValue(false);
      const result = await adapter.discover();
      expect(result.available).toBe(false);
      expect(result.reason).toContain("OpenCode CLI not found");
      expect(result.transport).toBe("cli");
    });
  });

  describe("startRun — command not found", () => {
    it("returns failed run when opencode CLI is missing", async () => {
      mockIsCommandAvailable.mockReturnValue(false);
      const run = await adapter.startRun(makeTask());
      expect(run.status).toBe("failed");
      expect(run.adapterId).toBe("opencode");
    });

    it("does not spawn a process when CLI is missing", async () => {
      mockIsCommandAvailable.mockReturnValue(false);
      await adapter.startRun(makeTask());
      expect(mockSpawnProcessLive).not.toHaveBeenCalled();
    });
  });

  describe("startRun — missing repoPath", () => {
    it("returns failed run when repoPath is empty", async () => {
      mockIsCommandAvailable.mockReturnValue(true);
      const run = await adapter.startRun(makeTask({ repoPath: "" }));
      expect(run.status).toBe("failed");
    });
  });

  describe("startRun — worktree policy violation", () => {
    it("returns failed run when working directory is blocked", async () => {
      mockIsCommandAvailable.mockReturnValue(true);
      mockValidateWorkdirPolicy.mockReturnValue({ allowed: false, reason: "Blocked path" });
      const run = await adapter.startRun(makeTask());
      expect(run.status).toBe("failed");
    });
  });

  describe("startRun — permission denied", () => {
    it("returns failed run when permission broker denies", async () => {
      mockIsCommandAvailable.mockReturnValue(true);
      vi.mocked(capabilityBroker.getCapabilityBroker).mockReturnValue({
        requestShellExec: vi.fn(async () => ({ decision: "deny" as const, reason: "Not allowed" })),
      } as any);
      const run = await adapter.startRun(makeTask());
      expect(run.status).toBe("failed");
    });
  });

  describe("startRun — approval required", () => {
    it("returns pending when approval is required", async () => {
      mockIsCommandAvailable.mockReturnValue(true);
      vi.mocked(capabilityBroker.getCapabilityBroker).mockReturnValue({
        requestShellExec: vi.fn(async () => ({ decision: "approval_required" as const, reason: "Needs approval" })),
      } as any);
      const run = await adapter.startRun(makeTask());
      expect(run.status).toBe("pending");
    });
  });

  describe("startRun — success", () => {
    it("starts running when permission is allowed", async () => {
      setupDefaultMocks();
      const run = await adapter.startRun(makeTask());
      expect(run.status).toBe("running");
      expect(run.pid).toBe(12345);
      expect(mockSpawnProcessLive).toHaveBeenCalled();
    });

    it("uses the documented non-interactive JSON command and per-run config", async () => {
      setupDefaultMocks();
      vi.mocked(configWriter.createRunConfig).mockReturnValue("/tmp/jarvis-run/opencode.json");
      await adapter.startRun(makeTask());

      expect(mockSpawnProcessLive).toHaveBeenCalledWith(expect.objectContaining({
        command: "opencode",
        args: ["run", "--format", "json", "Fix the bug in main.ts"],
        env: expect.objectContaining({ OPENCODE_CONFIG: expect.anything() }),
      }));
    });

    it("uses provided dbRunId", async () => {
      setupDefaultMocks();
      const run = await adapter.startRun(makeTask({ dbRunId: "custom-run-id" }));
      expect(run.runId).toBe("custom-run-id");
    });

    it("uses worktreePath when provided", async () => {
      setupDefaultMocks();
      await adapter.startRun(makeTask({ worktreePath: "/tmp/worktree" }));
      expect(mockSpawnProcessLive).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: "/tmp/worktree" }),
      );
    });

    it("falls back to repoPath when no worktreePath", async () => {
      setupDefaultMocks();
      await adapter.startRun(makeTask({ repoPath: "/tmp/repo" }));
      expect(mockSpawnProcessLive).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: "/tmp/repo" }),
      );
    });
  });

  describe("getRunStatus", () => {
    it("throws for unknown runId", async () => {
      await expect(adapter.getRunStatus("nonexistent")).rejects.toThrow("Coding run not found");
    });

    it("returns run info after startRun", async () => {
      setupDefaultMocks();
      const runHandle = await adapter.startRun(makeTask());
      const info = await adapter.getRunStatus(runHandle.runId);
      expect(info.runId).toBe(runHandle.runId);
      expect(info.status).toBe("running");
    });
  });

  describe("streamRunEvents", () => {
    it("throws for unknown runId", async () => {
      const gen = adapter.streamRunEvents("nonexistent") as AsyncGenerator;
      await expect(gen.next()).rejects.toThrow("Coding run not found");
    });
  });

  describe("cancelRun", () => {
    it("returns false for unknown runId", async () => {
      expect(await adapter.cancelRun("nonexistent")).toBe(false);
    });

    it("cancels a running run", async () => {
      setupDefaultMocks();
      const runHandle = await adapter.startRun(makeTask());
      expect(await adapter.cancelRun(runHandle.runId)).toBe(true);
      expect(mockKillProcessTree).toHaveBeenCalled();
      const info = await adapter.getRunStatus(runHandle.runId);
      expect(info.status).toBe("cancelled");
    });
  });

  describe("collectArtifacts", () => {
    it("throws for unknown runId", async () => {
      await expect(adapter.collectArtifacts("nonexistent")).rejects.toThrow("Coding run not found");
    });

    it("returns artifacts after startRun", async () => {
      setupDefaultMocks();
      const runHandle = await adapter.startRun(makeTask());
      const artifacts = await adapter.collectArtifacts(runHandle.runId);
      expect(Array.isArray(artifacts)).toBe(true);
    });
  });

  describe("createRun (deprecated)", () => {
    it("delegates to startRun and getRunStatus", async () => {
      setupDefaultMocks();
      const info = await adapter.createRun(makeTask());
      expect(info.runId).toBeDefined();
      expect(info.status).toBe("running");
    });
  });

  describe("process event handlers", () => {
    it("handles process close with exit code 0", async () => {
      setupDefaultMocks();
      const mockProc = makeMockProcess();
      mockSpawnProcessLive.mockReturnValue(makeMockHandle(mockProc) as any);

      const runHandle = await adapter.startRun(makeTask());
      mockProc.emitClose(0);
      const info = await adapter.getRunStatus(runHandle.runId);
      expect(info.status).toBe("succeeded");
      expect(info.completedAt).toBeDefined();
      expect(info.artifacts.some(a => a.type === "final_summary")).toBe(true);
    });

    it("handles process close with non-zero exit code", async () => {
      setupDefaultMocks();
      const mockProc = makeMockProcess();
      mockSpawnProcessLive.mockReturnValue(makeMockHandle(mockProc) as any);

      const runHandle = await adapter.startRun(makeTask());
      mockProc.emitClose(1);
      const info = await adapter.getRunStatus(runHandle.runId);
      expect(info.status).toBe("failed");
      expect(info.artifacts.some(a => a.type === "error")).toBe(true);
    });

    it("handles process error event", async () => {
      setupDefaultMocks();
      const mockProc = makeMockProcess();
      mockSpawnProcessLive.mockReturnValue(makeMockHandle(mockProc) as any);

      const runHandle = await adapter.startRun(makeTask());
      mockProc.emitError(new Error("spawn failed"));
      const info = await adapter.getRunStatus(runHandle.runId);
      expect(info.status).toBe("failed");
      expect(info.error).toBe("spawn failed");
    });
  });

  describe("workspace event emissions", () => {
    it("emits run.started event on successful run start", async () => {
      setupDefaultMocks();

      await adapter.startRun(makeTask());

      expect(workspaceEventEmitter.emitWorkspaceEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "workspace.run.started",
        }),
      );
    });

    it("emits run.completed event on process exit code 0", async () => {
      setupDefaultMocks();
      const mockProc = makeMockProcess();
      mockSpawnProcessLive.mockReturnValue(makeMockHandle(mockProc) as any);

      await adapter.startRun(makeTask());
      mockProc.emitClose(0);

      expect(workspaceEventEmitter.emitWorkspaceEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "workspace.run.completed",
        }),
      );
    });

    it("emits run.failed event on non-zero exit code", async () => {
      setupDefaultMocks();
      const mockProc = makeMockProcess();
      mockSpawnProcessLive.mockReturnValue(makeMockHandle(mockProc) as any);

      await adapter.startRun(makeTask());
      mockProc.emitClose(1);

      expect(workspaceEventEmitter.emitWorkspaceEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "workspace.run.failed",
        }),
      );
    });

    it("emits run.failed event on process error", async () => {
      setupDefaultMocks();
      const mockProc = makeMockProcess();
      mockSpawnProcessLive.mockReturnValue(makeMockHandle(mockProc) as any);

      await adapter.startRun(makeTask());
      mockProc.emitError(new Error("ENOENT"));

      expect(workspaceEventEmitter.emitWorkspaceEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "workspace.run.failed",
        }),
      );
    });
  });
});
