import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetByWorkspaceId = vi.fn();
const mockWorkspaceUpdate = vi.fn();
const mockGetOpenByWorkspace = vi.fn();

vi.mock("../persistence/factory.js", () => ({
  getRepositories: () => ({
    tasks: { getByWorkspaceId: mockGetByWorkspaceId },
    workspaces: { update: mockWorkspaceUpdate },
    pendingActions: { getOpenByWorkspace: mockGetOpenByWorkspace },
  }),
}));

const { reconcileWorkspaceStatus } = await import("./workspace-completion.js");

beforeEach(() => {
  vi.clearAllMocks();
  mockWorkspaceUpdate.mockResolvedValue(undefined);
  mockGetOpenByWorkspace.mockResolvedValue([]);
});

describe("reconcileWorkspaceStatus", () => {
  it("marks a workspace succeeded only when every required task completed", async () => {
    mockGetByWorkspaceId.mockResolvedValue([
      { id: "task-1", status: "completed", manualInterventionRequired: false },
      { id: "task-2", status: "done", manualInterventionRequired: false },
    ]);

    await expect(reconcileWorkspaceStatus("ws-1")).resolves.toBe("succeeded");
    expect(mockWorkspaceUpdate).toHaveBeenCalledWith("ws-1", {
      status: "succeeded",
      completedAt: expect.any(String),
    });
  });

  it("does not report success while work remains", async () => {
    mockGetByWorkspaceId.mockResolvedValue([
      { id: "task-1", status: "completed", manualInterventionRequired: false },
      { id: "task-2", status: "running", manualInterventionRequired: false },
    ]);

    await expect(reconcileWorkspaceStatus("ws-1")).resolves.toBe("running");
    expect(mockWorkspaceUpdate).not.toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ status: "succeeded" }),
    );
  });

  it("blocks a workspace that requires manual intervention", async () => {
    mockGetByWorkspaceId.mockResolvedValue([
      { id: "task-1", status: "blocked", manualInterventionRequired: true },
    ]);

    await expect(reconcileWorkspaceStatus("ws-1")).resolves.toBe("blocked");
    expect(mockWorkspaceUpdate).toHaveBeenCalledWith("ws-1", { status: "blocked" });
  });
});
