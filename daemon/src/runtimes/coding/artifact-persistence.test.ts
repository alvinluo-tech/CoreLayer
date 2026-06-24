import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "fs";

// Mock the event emitter
const mockEmitWorkspaceEvent = vi.fn();
vi.mock("../../services/workspace-event-emitter.js", () => ({
  emitWorkspaceEvent: (...args: unknown[]) => mockEmitWorkspaceEvent(...args),
}));

// Mock fs operations
vi.mock("fs", () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
}));

// Mock app paths
vi.mock("../../config/app-paths.js", () => ({
  resolveAppPaths: () => ({ appDataDir: "/tmp/test-app-data" }),
}));

// Mock session manager
vi.mock("../../services/session-manager.js", () => ({
  ensureSessionDir: vi.fn((id: string) => `/tmp/test-sessions/${id}`),
  recordArtifactInSession: vi.fn(),
}));

const { persistArtifacts } = await import("./artifact-persistence.js");

describe("persistArtifacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should persist artifacts to disk without event context", () => {
    const artifacts = [
      { type: "final_summary" as const, content: "Task completed" },
      { type: "changed_files" as const, content: "src/index.ts" },
    ];

    persistArtifacts("run-1", artifacts);

    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalled();
    expect(mockEmitWorkspaceEvent).not.toHaveBeenCalled();
  });

  it("should only emit artifact created events for durable deliverables", () => {
    const artifacts = [
      { type: "final_summary" as const, content: "Task completed" },
      { type: "changed_files" as const, content: "src/index.ts" },
    ];

    persistArtifacts("run-1", artifacts, undefined, {
      workspaceId: "ws-1",
      projectId: "proj-1",
      taskId: "task-1",
      agentRunId: "run-1",
      runtimeId: "claude-code",
    });

    expect(mockEmitWorkspaceEvent).toHaveBeenCalledTimes(1);

    expect(mockEmitWorkspaceEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "workspace.artifact.created",
        workspaceId: "ws-1",
        projectId: "proj-1",
        taskId: "task-1",
        agentRunId: "run-1",
        runtimeId: "claude-code",
        payload: expect.objectContaining({
          artifactType: "changed_files",
          artifactIndex: 0,
        }),
      }),
    );
  });

  it("should not emit events when artifacts are empty", () => {
    persistArtifacts("run-1", [], undefined, {
      workspaceId: "ws-1",
    });

    expect(mockEmitWorkspaceEvent).not.toHaveBeenCalled();
  });

  it("should not persist status-only artifacts", () => {
    const artifacts = [
      { type: "error" as const, content: "Something went wrong" },
      { type: "final_summary" as const, content: "Needs approval" },
    ];

    persistArtifacts("run-1", artifacts, undefined, {
      workspaceId: "ws-1",
    });

    expect(fs.mkdirSync).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(mockEmitWorkspaceEvent).not.toHaveBeenCalled();
  });

  it("should handle missing optional IDs in event context", () => {
    const artifacts = [
      { type: "test_report" as const, content: "Tests passed" },
    ];

    persistArtifacts("run-1", artifacts, undefined, {
      workspaceId: "ws-1",
    });

    expect(mockEmitWorkspaceEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "workspace.artifact.created",
        workspaceId: "ws-1",
        payload: expect.objectContaining({
          workspaceId: "ws-1",
          projectId: undefined,
          taskId: undefined,
          agentRunId: undefined,
          artifactType: "test_report",
        }),
      }),
    );
  });
});
