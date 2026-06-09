import { db, schema } from "../persistence/client.js";
import { eq, and, desc } from "drizzle-orm";

interface WorkspaceDetailViewModel {
  id: string;
  name: string;
  description: string | null;
  goal: string | null;
  status: string;
  activeProjectId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  summary: {
    progress: number;
    totalTasks: number;
    completedTasks: number;
    activeRuns: number;
    blockedTasks: number;
  };
  agents: Array<{
    id: string;
    name: string;
    role: string;
    status: string;
    joinedAt: string;
  }>;
  recentRuns: Array<{
    id: string;
    agentName: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
  }>;
  pendingApprovals: Array<{
    id: string;
    toolName: string;
    risk: string;
    createdAt: string;
  }>;
}

export async function getWorkspaceDetail(
  workspaceId: string
): Promise<WorkspaceDetailViewModel | null> {
  const workspace = db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId))
    .get();

  if (!workspace) return null;

  // Get agents in workspace
  const workspaceAgents = db
    .select({
      id: schema.workspaceAgents.id,
      agentProfileId: schema.workspaceAgents.agentProfileId,
      roleInWorkspace: schema.workspaceAgents.roleInWorkspace,
      status: schema.workspaceAgents.status,
      joinedAt: schema.workspaceAgents.joinedAt,
      agentName: schema.agentProfiles.name,
      agentRole: schema.agentProfiles.role,
    })
    .from(schema.workspaceAgents)
    .innerJoin(
      schema.agentProfiles,
      eq(schema.workspaceAgents.agentProfileId, schema.agentProfiles.id)
    )
    .where(eq(schema.workspaceAgents.workspaceId, workspaceId))
    .all();

  // Get tasks for summary
  const tasks = db
    .select({ status: schema.tasks.status })
    .from(schema.tasks)
    .where(eq(schema.tasks.workspaceId, workspaceId))
    .all();

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === "completed" || t.status === "done").length;
  const blockedTasks = tasks.filter((t) => t.status === "blocked").length;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Get recent runs
  const recentRuns = db
    .select({
      id: schema.agentRuns.id,
      status: schema.agentRuns.status,
      startedAt: schema.agentRuns.startedAt,
      completedAt: schema.agentRuns.completedAt,
      agentName: schema.agentProfiles.name,
    })
    .from(schema.agentRuns)
    .innerJoin(
      schema.agentProfiles,
      eq(schema.agentRuns.agentId, schema.agentProfiles.id)
    )
    .where(eq(schema.agentRuns.workspaceId, workspaceId))
    .orderBy(desc(schema.agentRuns.startedAt))
    .limit(5)
    .all();

  const activeRuns = recentRuns.filter((r) => r.status === "running").length;

  // Get pending approvals
  const pendingApprovals = db
    .select({
      id: schema.approvalRequests.id,
      toolName: schema.approvalRequests.toolName,
      risk: schema.approvalRequests.risk,
      createdAt: schema.approvalRequests.createdAt,
    })
    .from(schema.approvalRequests)
    .innerJoin(
      schema.agentRuns,
      eq(schema.approvalRequests.runId, schema.agentRuns.id)
    )
    .where(
      and(
        eq(schema.agentRuns.workspaceId, workspaceId),
        eq(schema.approvalRequests.status, "pending")
      )
    )
    .all();

  return {
    id: workspace.id,
    name: workspace.name,
    description: workspace.description,
    goal: workspace.goal,
    status: workspace.status,
    activeProjectId: workspace.activeProjectId,
    completedAt: workspace.completedAt,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    summary: {
      progress,
      totalTasks,
      completedTasks,
      activeRuns,
      blockedTasks,
    },
    agents: workspaceAgents.map((a) => ({
      id: a.id,
      name: a.agentName,
      role: a.agentRole,
      status: a.status,
      joinedAt: a.joinedAt,
    })),
    recentRuns: recentRuns.map((r) => ({
      id: r.id,
      agentName: r.agentName,
      status: r.status,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
    })),
    pendingApprovals: pendingApprovals.map((a) => ({
      id: a.id,
      toolName: a.toolName,
      risk: a.risk,
      createdAt: String(a.createdAt),
    })),
  };
}
