import { describe, it, expect, vi, beforeEach } from "vitest";
import { CodingExecutorAdapterWrapper } from "../executor-adapter-wrapper.js";
import type { CodingAgentAdapter, CodingTask, CodingRunHandle, CodingRunInfo, CodingArtifact, AdapterAvailability } from "../types.js";
import type { NormalizedEvent } from "../events/coding-event.js";

function createMockAdapter(overrides?: Partial<CodingAgentAdapter>): CodingAgentAdapter {
  return {
    id: "mock-adapter",
    displayName: "Mock Adapter",
    name: "Mock Adapter",
    discover: vi.fn().mockResolvedValue({
      available: true,
      version: "1.0.0",
      transport: "cli",
    } satisfies AdapterAvailability),
    startRun: vi.fn().mockImplementation((task: CodingTask) => Promise.resolve({
      runId: task.dbRunId ?? "run-1",
      adapterId: "mock-adapter",
      status: "running",
      pid: 1234,
      startedAt: "2026-01-01T00:00:00Z",
    } satisfies CodingRunHandle)),
    createRun: vi.fn(),
    getRunStatus: vi.fn().mockResolvedValue({
      runId: "run-1",
      adapterId: "mock-adapter",
      status: "running",
      task: {} as CodingTask,
      startedAt: "2026-01-01T00:00:00Z",
      artifacts: [],
    } satisfies CodingRunInfo),
    streamRunEvents: vi.fn(),
    cancelRun: vi.fn().mockResolvedValue(true),
    collectArtifacts: vi.fn().mockResolvedValue([
      { type: "final_summary", content: "Done", metadata: {} },
    ] satisfies CodingArtifact[]),
    ...overrides,
  } as CodingAgentAdapter;
}

describe("CodingExecutorAdapterWrapper", () => {
  let mockAdapter: CodingAgentAdapter;
  let wrapper: CodingExecutorAdapterWrapper;

  beforeEach(() => {
    mockAdapter = createMockAdapter();
    wrapper = new CodingExecutorAdapterWrapper(mockAdapter);
  });

  it("should expose inner adapter id and displayName", () => {
    expect(wrapper.id).toBe("mock-adapter");
    expect(wrapper.displayName).toBe("Mock Adapter");
  });

  describe("discover", () => {
    it("should delegate to inner discover", async () => {
      const result = await wrapper.discover();
      expect(result.available).toBe(true);
      expect(result.version).toBe("1.0.0");
      expect(result.transport).toBe("cli");
      expect(mockAdapter.discover).toHaveBeenCalled();
    });

    it("should handle unavailable adapter", async () => {
      vi.mocked(mockAdapter.discover).mockResolvedValue({
        available: false,
        reason: "Not installed",
        transport: "cli",
      });
      const result = await wrapper.discover();
      expect(result.available).toBe(false);
      expect(result.reason).toBe("Not installed");
    });
  });

  describe("getCapabilities", () => {
    it("should return coding domain capabilities", () => {
      const caps = wrapper.getCapabilities();
      expect(caps.adapterId).toBe("mock-adapter");
      expect(caps.domain).toBe("coding");
      expect(caps.nonInteractive).toBe(true);
      expect(caps.cancellation).toBe(true);
    });
  });

  describe("prepare", () => {
    it("should map ExecutorRunRequest to CodingTask and start run", async () => {
      const handle = await wrapper.prepare({
        runId: "run-1",
        agentId: "agent-1",
        adapterId: "mock-adapter",
        taskPrompt: "Fix the bug",
        environment: {
          kind: "git-worktree",
          workingDirectory: "/tmp/repo",
          metadata: { branchName: "feat/fix", worktreePath: "/tmp/worktree" },
        },
      });

      expect(handle.runId).toBe("run-1");
      expect(handle.status).toBe("running");
      expect(handle.pid).toBe(1234);
      expect(mockAdapter.startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          dbRunId: "run-1",
          repoPath: "/tmp/repo",
          worktreePath: "/tmp/worktree",
          branchName: "feat/fix",
          taskPrompt: "Fix the bug",
        }),
      );
    });

    it("should handle non-coding environment", async () => {
      const handle = await wrapper.prepare({
        runId: "run-2",
        agentId: "agent-1",
        adapterId: "mock-adapter",
        taskPrompt: "Research task",
        environment: {
          kind: "browser-session",
          workingDirectory: null as unknown as string,
        },
      });

      expect(handle.runId).toBe("run-2");
      expect(mockAdapter.startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          repoPath: "",
        }),
      );
    });
  });

  describe("getStatus", () => {
    it("should map coding status to executor status", async () => {
      const status = await wrapper.getStatus("run-1");
      expect(status.status).toBe("running");
    });

    it("should map succeeded status", async () => {
      vi.mocked(mockAdapter.getRunStatus).mockResolvedValue({
        runId: "run-1",
        adapterId: "mock-adapter",
        status: "succeeded",
        task: {} as CodingTask,
        startedAt: "2026-01-01T00:00:00Z",
        completedAt: "2026-01-01T00:01:00Z",
        durationMs: 60000,
        artifacts: [],
      });
      const status = await wrapper.getStatus("run-1");
      expect(status.status).toBe("succeeded");
      expect(status.durationMs).toBe(60000);
    });
  });

  describe("requestCancel", () => {
    it("should delegate to inner cancelRun", async () => {
      await wrapper.requestCancel("run-1");
      expect(mockAdapter.cancelRun).toHaveBeenCalledWith("run-1");
    });
  });

  describe("collectArtifacts", () => {
    it("should map coding artifacts to generic artifacts", async () => {
      const result = await wrapper.collectArtifacts("run-1");
      expect(result.runId).toBe("run-1");
      // final_summary is excluded from artifacts array (status-only metadata)
      expect(result.artifacts).toHaveLength(0);
      expect(result.finalSummary).toBe("Done");
    });

    it("should extract logPath from artifacts", async () => {
      vi.mocked(mockAdapter.collectArtifacts).mockResolvedValue([
        { type: "log_path", content: "/tmp/logs/run-1.log", metadata: {} },
      ]);
      const result = await wrapper.collectArtifacts("run-1");
      expect(result.logPath).toBe("/tmp/logs/run-1.log");
    });
  });

  describe("event mapping", () => {
    it("should map run_completed to executor.completed", () => {
      const normalized: NormalizedEvent = {
        runId: "run-1",
        sequence: 1,
        event: { type: "run_completed", summary: "Done" },
        createdAt: "2026-01-01T00:00:00Z",
      };
      // Access private method for testing
      const eventType = (wrapper as any).mapEventType(normalized);
      expect(eventType).toBe("executor.completed");
    });

    it("should map run_failed to executor.failed", () => {
      const normalized: NormalizedEvent = {
        runId: "run-1",
        sequence: 1,
        event: { type: "run_failed", error: "Crashed" },
        createdAt: "2026-01-01T00:00:00Z",
      };
      const eventType = (wrapper as any).mapEventType(normalized);
      expect(eventType).toBe("executor.failed");
    });

    it("should map approval_requested to executor.permission_blocked", () => {
      const normalized: NormalizedEvent = {
        runId: "run-1",
        sequence: 1,
        event: { type: "approval_requested", risk: "high", reason: "shell exec" },
        createdAt: "2026-01-01T00:00:00Z",
      };
      const eventType = (wrapper as any).mapEventType(normalized);
      expect(eventType).toBe("executor.permission_blocked");
    });

    it("should map agent_message to executor.output", () => {
      const normalized: NormalizedEvent = {
        runId: "run-1",
        sequence: 1,
        event: { type: "agent_message", text: "Working on it" },
        createdAt: "2026-01-01T00:00:00Z",
      };
      const eventType = (wrapper as any).mapEventType(normalized);
      expect(eventType).toBe("executor.output");
    });
  });

  describe("wrapCodingAdapters", () => {
    it("should wrap multiple adapters", async () => {
      const { wrapCodingAdapters } = await import("../executor-adapter-wrapper.js");
      const adapters = [createMockAdapter(), createMockAdapter({ id: "codex" } as any)];
      const wrapped = wrapCodingAdapters(adapters);
      expect(wrapped).toHaveLength(2);
      expect(wrapped[0].id).toBe("mock-adapter");
      expect(wrapped[1].id).toBe("codex");
    });
  });
});
