import { describe, it, expect, beforeEach, vi } from "vitest";

const mockEventLogCreate = vi.fn();

vi.mock("../persistence/factory.js", () => ({
  getRepositories: () => ({
    eventLog: { create: mockEventLogCreate },
  }),
}));

vi.mock("../shared/errors.js", () => ({
  logError: vi.fn(),
}));

const { emitWorkspaceEvent } = await import("./workspace-event-emitter.js");
const { logError } = await import("../shared/errors.js");

describe("emitWorkspaceEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEventLogCreate.mockResolvedValue({
      id: "evt-1",
      type: "workspace.created",
      projectId: null,
      taskId: null,
      agentRunId: null,
      runtimeId: null,
      payload: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("should emit with a stable envelope", async () => {
    await emitWorkspaceEvent({
      type: "workspace.created",
      title: "Workspace created",
      workspaceId: "ws-1",
      payload: { workspaceId: "ws-1", goal: "Build app" },
    });

    expect(mockEventLogCreate).toHaveBeenCalledWith({
      type: "workspace.created",
      projectId: null,
      taskId: null,
      agentRunId: null,
      runtimeId: null,
      payload: {
        title: "Workspace created",
        summary: null,
        severity: "info",
        actor: "system",
        workspaceId: "ws-1",
        goal: "Build app",
      },
    });
  });

  it("should preserve structured metadata", async () => {
    await emitWorkspaceEvent({
      type: "workspace.run.completed",
      title: "Run completed",
      summary: "Finished in 12s",
      severity: "success",
      actor: "agent",
      workspaceId: "ws-1",
      projectId: "proj-1",
      taskId: "task-1",
      agentRunId: "run-1",
      runtimeId: "rt-1",
      payload: {
        workspaceId: "ws-1",
        projectId: "proj-1",
        taskId: "task-1",
        agentRunId: "run-1",
        runtimeId: "rt-1",
        durationMs: 12000,
        artifactCount: 3,
      },
    });

    expect(mockEventLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "workspace.run.completed",
        projectId: "proj-1",
        taskId: "task-1",
        agentRunId: "run-1",
        runtimeId: "rt-1",
        payload: expect.objectContaining({
          title: "Run completed",
          summary: "Finished in 12s",
          severity: "success",
          actor: "agent",
          workspaceId: "ws-1",
          durationMs: 12000,
          artifactCount: 3,
        }),
      }),
    );
  });

  it("should handle missing optional IDs", async () => {
    await emitWorkspaceEvent({
      type: "workspace.task.queued",
      title: "Task queued",
      workspaceId: "ws-1",
      projectId: "proj-1",
      payload: {
        workspaceId: "ws-1",
        projectId: "proj-1",
        taskId: "task-1",
        taskTitle: "Implement feature",
      },
    });

    expect(mockEventLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "proj-1",
        taskId: null,
        agentRunId: null,
        runtimeId: null,
      }),
    );
  });

  it("should not throw when event persistence fails", async () => {
    mockEventLogCreate.mockRejectedValue(new Error("DB connection lost"));

    await expect(
      emitWorkspaceEvent({
        type: "workspace.created",
        title: "Workspace created",
        workspaceId: "ws-1",
        payload: { workspaceId: "ws-1", goal: "Build app" },
      }),
    ).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledWith(
      "workspace-event-emitter",
      expect.any(Error),
    );
  });

  it("should default severity to info and actor to system", async () => {
    await emitWorkspaceEvent({
      type: "workspace.blocked",
      title: "Workspace blocked",
      workspaceId: "ws-1",
      payload: { workspaceId: "ws-1", reason: "Dependency cycle" },
    });

    expect(mockEventLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          severity: "info",
          actor: "system",
        }),
      }),
    );
  });

  it("should include artifactId in payload when provided", async () => {
    await emitWorkspaceEvent({
      type: "workspace.artifact.created",
      title: "Artifact created",
      workspaceId: "ws-1",
      projectId: "proj-1",
      artifactId: "art-1",
      payload: {
        workspaceId: "ws-1",
        projectId: "proj-1",
        artifactType: "spec",
        artifactIndex: 0,
      },
    });

    expect(mockEventLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          artifactId: "art-1",
          artifactType: "spec",
          artifactIndex: 0,
        }),
      }),
    );
  });
});
