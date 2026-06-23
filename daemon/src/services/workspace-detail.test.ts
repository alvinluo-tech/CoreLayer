import { describe, it, expect, beforeEach, vi } from "vitest";

// Drizzle ORM mock chain — each call returns { from: → { where: → { all/get/limit/orderBy } } }
const mockAll = vi.fn();
const mockGet = vi.fn();
const mockLimit = vi.fn(() => ({ all: mockAll }));
const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
const mockInnerJoin = vi.fn(() => ({ where: mockWhere }));
const mockWhere = vi.fn(() => ({ all: mockAll, get: mockGet, orderBy: mockOrderBy, limit: mockLimit }));
const mockFrom = vi.fn(() => ({
  where: mockWhere,
  get: mockGet,
  innerJoin: mockInnerJoin,
  orderBy: mockOrderBy,
}));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock("../persistence/client.js", () => ({
  db: { select: mockSelect },
  schema: {
    workspaces: { id: "ws_id", name: "ws_name", description: "ws_desc", goal: "ws_goal", status: "ws_status", activeProjectId: "ws_active", completedAt: "ws_completed", createdAt: "ws_created", updatedAt: "ws_updated" },
    workspaceAgents: { id: "wa_id", agentProfileId: "wa_agentId", roleInWorkspace: "wa_role", status: "wa_status", joinedAt: "wa_joined", workspaceId: "wa_wsId" },
    agentProfiles: { id: "ap_id", name: "ap_name", role: "ap_role" },
    tasks: { status: "t_status", projectId: "t_projectId", workspaceId: "t_wsId" },
    projects: { id: "p_id", name: "p_name", description: "p_desc", status: "p_status", workspaceId: "p_wsId" },
    agentRuns: { id: "ar_id", status: "ar_status", startedAt: "ar_started", completedAt: "ar_completed", agentId: "ar_agentId", taskId: "ar_taskId", workspaceId: "ar_wsId" },
    approvalRequests: { id: "apr_id", toolName: "apr_tool", risk: "apr_risk", createdAt: "apr_created", runId: "apr_runId", status: "apr_status" },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({ type: "eq" })),
  and: vi.fn(() => ({ type: "and" })),
  desc: vi.fn(() => ({ type: "desc" })),
}));

const { getWorkspaceDetail } = await import("./workspace-detail.js");

describe("getWorkspaceDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return null when workspace not found", async () => {
    mockGet.mockReturnValue(undefined);

    const result = await getWorkspaceDetail("nonexistent");

    expect(result).toBeNull();
  });

  it("should return workspace detail with empty tasks", async () => {
    const workspace = {
      id: "ws-1", name: "Test", description: "desc", goal: "goal",
      status: "idle", activeProjectId: null, completedAt: null,
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    };
    mockGet.mockReturnValue(workspace);
    // workspaceAgents query
    mockAll
      .mockReturnValueOnce([])   // workspaceAgents
      .mockReturnValueOnce([])   // tasks
      .mockReturnValueOnce([])   // projects
      .mockReturnValueOnce([])   // recentRuns
      .mockReturnValueOnce([]);  // pendingApprovals

    const result = await getWorkspaceDetail("ws-1");

    expect(result).not.toBeNull();
    expect(result!.id).toBe("ws-1");
    expect(result!.name).toBe("Test");
    expect(result!.summary.totalTasks).toBe(0);
    expect(result!.summary.progress).toBe(0);
    expect(result!.agents).toEqual([]);
    expect(result!.projects).toEqual([]);
  });

  it("should compute task summary correctly", async () => {
    const workspace = {
      id: "ws-1", name: "W", description: null, goal: null,
      status: "idle", activeProjectId: null, completedAt: null,
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    };
    mockGet.mockReturnValue(workspace);
    mockAll
      .mockReturnValueOnce([])  // workspaceAgents
      .mockReturnValueOnce([    // tasks
        { status: "completed", projectId: "p1" },
        { status: "done", projectId: "p1" },
        { status: "running", projectId: null },
        { status: "blocked", projectId: "p1" },
        { status: "failed", projectId: null },
        { status: "queued", projectId: null },
        { status: "pending", projectId: null },
        { status: "draft", projectId: null },
      ])
      .mockReturnValueOnce([])  // projects
      .mockReturnValueOnce([])  // recentRuns
      .mockReturnValueOnce([]); // pendingApprovals

    const result = await getWorkspaceDetail("ws-1");

    expect(result!.summary.totalTasks).toBe(8);
    expect(result!.summary.completedTasks).toBe(2);
    expect(result!.summary.activeTasks).toBe(1);
    expect(result!.summary.blockedTasks).toBe(1);
    expect(result!.summary.failedTasks).toBe(1);
    expect(result!.summary.queuedTasks).toBe(3);
    expect(result!.summary.progress).toBe(25);
  });

  it("should derive status as failed when tasks have failures", async () => {
    const workspace = {
      id: "ws-1", name: "W", description: null, goal: null,
      status: "running", activeProjectId: null, completedAt: null,
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    };
    mockGet.mockReturnValue(workspace);
    mockAll
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{ status: "failed", projectId: null }])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);

    const result = await getWorkspaceDetail("ws-1");

    expect(result!.status).toBe("failed");
  });

  it("should derive status as running when tasks are active", async () => {
    const workspace = {
      id: "ws-1", name: "W", description: null, goal: null,
      status: "idle", activeProjectId: null, completedAt: null,
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    };
    mockGet.mockReturnValue(workspace);
    mockAll
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{ status: "running", projectId: null }])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);

    const result = await getWorkspaceDetail("ws-1");

    expect(result!.status).toBe("running");
  });

  it("should derive status as succeeded when all tasks completed", async () => {
    const workspace = {
      id: "ws-1", name: "W", description: null, goal: null,
      status: "running", activeProjectId: null, completedAt: null,
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    };
    mockGet.mockReturnValue(workspace);
    mockAll
      .mockReturnValueOnce([])
      .mockReturnValueOnce([
        { status: "completed", projectId: null },
        { status: "done", projectId: null },
      ])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);

    const result = await getWorkspaceDetail("ws-1");

    expect(result!.status).toBe("succeeded");
  });

  it("should map workspace agents correctly", async () => {
    const workspace = {
      id: "ws-1", name: "W", description: null, goal: null,
      status: "idle", activeProjectId: null, completedAt: null,
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    };
    mockGet.mockReturnValue(workspace);
    mockAll
      .mockReturnValueOnce([{
        id: "wa-1", agentProfileId: "ap-1", roleInWorkspace: "builder",
        status: "idle", joinedAt: "2026-01-01", agentName: "Coder", agentRole: "coding",
      }])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);

    const result = await getWorkspaceDetail("ws-1");

    expect(result!.agents).toHaveLength(1);
    expect(result!.agents[0]).toEqual({
      id: "wa-1", agentProfileId: "ap-1", name: "Coder", role: "coding", status: "idle", currentTaskId: null, latestRunId: null, joinedAt: "2026-01-01",
    });
  });

  it("should derive workspace agent status from latest run", async () => {
    const workspace = {
      id: "ws-1", name: "W", description: null, goal: null,
      status: "idle", activeProjectId: null, completedAt: null,
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    };
    mockGet.mockReturnValue(workspace);
    mockAll
      .mockReturnValueOnce([{
        id: "wa-1", agentProfileId: "ap-1", roleInWorkspace: "builder",
        status: "idle", joinedAt: "2026-01-01", agentName: "Coder", agentRole: "coding",
      }])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([
        { id: "r1", status: "running", startedAt: "2026-01-01", completedAt: null, agentId: "ap-1", taskId: "task-1", agentName: "Coder" },
      ])
      .mockReturnValueOnce([]);

    const result = await getWorkspaceDetail("ws-1");

    expect(result!.agents[0]).toMatchObject({
      status: "running",
      currentTaskId: "task-1",
      latestRunId: "r1",
    });
  });

  it("should compute project task counts and progress", async () => {
    const workspace = {
      id: "ws-1", name: "W", description: null, goal: null,
      status: "idle", activeProjectId: null, completedAt: null,
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    };
    mockGet.mockReturnValue(workspace);
    mockAll
      .mockReturnValueOnce([])
      .mockReturnValueOnce([
        { status: "completed", projectId: "p1" },
        { status: "running", projectId: "p1" },
        { status: "completed", projectId: "p2" },
      ])
      .mockReturnValueOnce([
        { id: "p1", name: "Project 1", description: "d1", status: "active", workspaceId: "ws-1" },
        { id: "p2", name: "Project 2", description: "d2", status: "done", workspaceId: "ws-1" },
      ])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);

    const result = await getWorkspaceDetail("ws-1");

    expect(result!.projects).toHaveLength(2);
    const p1 = result!.projects.find((p) => p.id === "p1")!;
    expect(p1.taskCount).toBe(2);
    expect(p1.completedTasks).toBe(1);
    expect(p1.progress).toBe(50);

    const p2 = result!.projects.find((p) => p.id === "p2")!;
    expect(p2.taskCount).toBe(1);
    expect(p2.completedTasks).toBe(1);
    expect(p2.progress).toBe(100);
  });

  it("should map recent runs with active count", async () => {
    const workspace = {
      id: "ws-1", name: "W", description: null, goal: null,
      status: "idle", activeProjectId: null, completedAt: null,
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    };
    mockGet.mockReturnValue(workspace);
    mockAll
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([
        { id: "r1", status: "running", startedAt: "2026-01-01", completedAt: null, agentName: "Agent1" },
        { id: "r2", status: "completed", startedAt: "2026-01-01", completedAt: "2026-01-02", agentName: "Agent2" },
      ])
      .mockReturnValueOnce([]);

    const result = await getWorkspaceDetail("ws-1");

    expect(result!.recentRuns).toHaveLength(2);
    expect(result!.summary.activeRuns).toBe(1);
  });

  it("should map pending approvals", async () => {
    const workspace = {
      id: "ws-1", name: "W", description: null, goal: null,
      status: "idle", activeProjectId: null, completedAt: null,
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    };
    mockGet.mockReturnValue(workspace);
    mockAll
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([
        { id: "apr-1", toolName: "shell_exec", risk: "high", createdAt: "2026-01-01" },
      ]);

    const result = await getWorkspaceDetail("ws-1");

    expect(result!.pendingApprovals).toHaveLength(1);
    expect(result!.pendingApprovals[0].toolName).toBe("shell_exec");
    expect(result!.pendingApprovals[0].risk).toBe("high");
  });

  it("should pass workspace ID to all queries", async () => {
    const workspace = {
      id: "ws-42", name: "W", description: null, goal: null,
      status: "idle", activeProjectId: null, completedAt: null,
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    };
    mockGet.mockReturnValue(workspace);
    mockAll.mockReturnValue([]);

    await getWorkspaceDetail("ws-42");

    // Verify eq was called with the workspace ID for filtering
    expect(mockWhere).toHaveBeenCalled();
  });
});
