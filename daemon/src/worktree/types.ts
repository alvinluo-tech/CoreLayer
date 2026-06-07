/**
 * Worktree and Project Isolation types.
 *
 * Supports multi-project, multi-agent parallel code execution
 * with git worktree-based isolation.
 */

/** Status of a worktree workspace */
export type WorktreeStatus =
  | "active"
  | "completed"
  | "merged"
  | "abandoned"
  | "conflict";

/** A project workspace linked to a repository */
export interface ProjectWorkspace {
  id: string;
  projectId: string;
  repoPath: string;
  defaultBranch: string;
  workspaceRoot: string;
  createdAt: string;
}

/** An agent run's isolated workspace */
export interface AgentRunWorkspace {
  id: string;
  agentRunId: string;
  projectId: string;
  worktreePath: string;
  branchName: string;
  status: WorktreeStatus;
  changedFiles: string[];
  createdAt: string;
  updatedAt: string;
}

/** Input for creating a project workspace */
export interface CreateProjectWorkspaceInput {
  projectId: string;
  repoPath: string;
  defaultBranch?: string;
}

/** Input for creating an agent run workspace */
export interface CreateAgentRunWorkspaceInput {
  agentRunId: string;
  projectId: string;
  branchName?: string;
}

/** File conflict between two agent runs */
export interface FileConflict {
  filePath: string;
  workspaceA: string;
  workspaceB: string;
  agentRunA: string;
  agentRunB: string;
}
