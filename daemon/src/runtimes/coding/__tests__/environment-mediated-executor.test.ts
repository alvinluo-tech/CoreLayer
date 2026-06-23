import { describe, it, expect, vi } from "vitest";
import {
  executeThroughEnvironment,
  getMediatedRunStatus,
  cancelMediatedRun,
  collectMediatedArtifacts,
} from "../environment-mediated-executor.js";
import type { CodingAgentAdapter, CodingTask } from "../types.js";
import type { ExecutionEnvironment, EnvironmentSession } from "@jarvis/execution-environment";

function createMockEnv(overrides?: Partial<ExecutionEnvironment>): ExecutionEnvironment {
  return {
    kind: "git-worktree",
    createSession: vi.fn(),
    getSession: vi.fn(),
    executeAction: vi.fn(),
    executeCommand: vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "RESEARCH_OK",
      stderr: "",
      durationMs: 1000,
    }),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    collectArtifacts: vi.fn().mockResolvedValue([
      {
        id: "a-1",
        kind: "changed-files",
        content: '["file.ts"]',
        summary: "1 file changed",
        createdAt: new Date().toISOString(),
      },
    ]),
    dispose: vi.fn(),
    ...overrides,
  };
}

function createMockAdapter(): CodingAgentAdapter {
  return {
    id: "claude-code",
    displayName: "Claude Code",
    name: "Claude Code",
    discover: vi.fn(),
    startRun: vi.fn(),
    createRun: vi.fn(),
    getRunStatus: vi.fn(),
    streamRunEvents: vi.fn(),
    cancelRun: vi.fn(),
    collectArtifacts: vi.fn(),
  } as CodingAgentAdapter;
}

function createMockSession(): EnvironmentSession {
  return {
    id: "env-session-1",
    environmentKind: "git-worktree",
    state: "ready",
    workingDirectory: "/tmp/worktree",
    workspaceId: "ws-1",
    runId: "run-1",
    agentId: "agent-1",
    createdAt: new Date().toISOString(),
  };
}

const sampleTask: CodingTask = {
  dbRunId: "run-1",
  repoPath: "/tmp/repo",
  taskPrompt: "Fix the bug",
  timeoutMs: 30_000,
};

describe("executeThroughEnvironment", () => {
  it("should return a running handle", async () => {
    const env = createMockEnv();
    const adapter = createMockAdapter();
    const session = createMockSession();

    const handle = await executeThroughEnvironment(env, adapter, sampleTask, session);

    expect(handle.runId).toBe("run-1");
    expect(handle.adapterId).toBe("claude-code");
    expect(handle.status).toBe("running");
  });

  it("should execute command through environment", async () => {
    const env = createMockEnv();
    const adapter = createMockAdapter();
    const session = createMockSession();

    await executeThroughEnvironment(env, adapter, sampleTask, session);

    // Wait for async execution
    await new Promise((r) => setTimeout(r, 50));

    expect(env.executeCommand).toHaveBeenCalledWith(
      "env-session-1",
      expect.stringContaining("claude --print"),
      30_000,
    );
  });
});

describe("getMediatedRunStatus", () => {
  it("should return null for unknown run", () => {
    expect(getMediatedRunStatus("unknown")).toBeNull();
  });

  it("should return running status initially", async () => {
    const env = createMockEnv({
      executeCommand: vi.fn().mockImplementation(
        () => new Promise((r) => setTimeout(r, 5000)),
      ),
    });
    const adapter = createMockAdapter();
    const session = createMockSession();

    await executeThroughEnvironment(env, adapter, sampleTask, session);
    const status = getMediatedRunStatus("run-1");

    expect(status).not.toBeNull();
    expect(status!.status).toBe("running");
    expect(status!.adapterId).toBe("claude-code");
  });
});

describe("cancelMediatedRun", () => {
  it("should cancel a running mediated run", async () => {
    const env = createMockEnv({
      executeCommand: vi.fn().mockImplementation(
        () => new Promise((r) => setTimeout(r, 5000)),
      ),
    });
    const adapter = createMockAdapter();
    const session = createMockSession();

    await executeThroughEnvironment(env, adapter, sampleTask, session);
    const result = await cancelMediatedRun(env, "run-1");

    expect(result).toBe(true);
    expect(env.dispose).toHaveBeenCalledWith("env-session-1");

    const status = getMediatedRunStatus("run-1");
    expect(status!.status).toBe("cancelled");
  });

  it("should return false for non-running run", async () => {
    const env = createMockEnv();
    const result = await cancelMediatedRun(env, "unknown");
    expect(result).toBe(false);
  });
});

describe("collectMediatedArtifacts", () => {
  it("should collect artifacts through environment", async () => {
    const env = createMockEnv();
    const adapter = createMockAdapter();
    const session = createMockSession();

    await executeThroughEnvironment(env, adapter, sampleTask, session);

    // Wait for async execution to complete
    await new Promise((r) => setTimeout(r, 100));

    const artifacts = await collectMediatedArtifacts(env, "run-1");
    expect(artifacts.length).toBeGreaterThan(0);
    expect(env.collectArtifacts).toHaveBeenCalledWith("env-session-1");
  });

  it("should return empty array for unknown run", async () => {
    const env = createMockEnv();
    const artifacts = await collectMediatedArtifacts(env, "unknown");
    expect(artifacts).toEqual([]);
  });
});
