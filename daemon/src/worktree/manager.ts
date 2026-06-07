/**
 * WorktreeManager — manages git worktrees for isolated agent execution.
 *
 * Each coding agent run gets its own worktree so multiple agents
 * can work on different files in parallel without conflicts.
 */

import type {
  ProjectWorkspace,
  AgentRunWorkspace,
  CreateProjectWorkspaceInput,
  CreateAgentRunWorkspaceInput,
  FileConflict,
} from "./types.js";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execGit, allowGitRoot } from "../capabilities/adapters/git-command-adapter.js";

/** In-memory store (will be replaced with DB-backed store) */
const projectWorkspaces = new Map<string, ProjectWorkspace>();
const agentWorkspaces = new Map<string, AgentRunWorkspace>();

/**
 * Create a project workspace from an existing git repo.
 */
export function createProjectWorkspace(
  input: CreateProjectWorkspaceInput,
): ProjectWorkspace {
  const id = crypto.randomUUID();
  const defaultBranch = input.defaultBranch ?? "main";
  const workspaceRoot = join(input.repoPath, ".jarvis", "worktrees");

  if (!existsSync(input.repoPath)) {
    throw new Error(`Repository path does not exist: ${input.repoPath}`);
  }

  mkdirSync(workspaceRoot, { recursive: true });

  // Register repo and workspace root as allowed git execution dirs
  allowGitRoot(input.repoPath);
  allowGitRoot(workspaceRoot);

  const workspace: ProjectWorkspace = {
    id,
    projectId: input.projectId,
    repoPath: input.repoPath,
    defaultBranch,
    workspaceRoot,
    createdAt: new Date().toISOString(),
  };

  projectWorkspaces.set(id, workspace);
  return workspace;
}

/**
 * Create an agent run workspace using git worktree.
 */
export async function createAgentRunWorkspace(
  input: CreateAgentRunWorkspaceInput,
): Promise<AgentRunWorkspace> {
  const projectWs = Array.from(projectWorkspaces.values()).find(
    (ws) => ws.projectId === input.projectId,
  );
  if (!projectWs) {
    throw new Error(`No project workspace found for project: ${input.projectId}`);
  }

  const id = crypto.randomUUID();
  const branchName = input.branchName ?? `agent/${input.agentRunId.slice(0, 8)}`;
  const worktreePath = join(projectWs.workspaceRoot, `run-${id.slice(0, 8)}`);

  try {
    await execGit(
      ["worktree", "add", "-b", branchName, worktreePath, "HEAD"],
      projectWs.repoPath,
      "worktree-manager",
      { agentRunId: input.agentRunId, projectId: input.projectId },
    );
  } catch {
    // If branch already exists, try without -b
    try {
      await execGit(
        ["worktree", "add", worktreePath, branchName],
        projectWs.repoPath,
        "worktree-manager",
        { agentRunId: input.agentRunId, projectId: input.projectId },
      );
    } catch (err) {
      throw new Error(`Failed to create worktree: ${err}`);
    }
  }

  const workspace: AgentRunWorkspace = {
    id,
    agentRunId: input.agentRunId,
    projectId: input.projectId,
    worktreePath,
    branchName,
    status: "active",
    changedFiles: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  agentWorkspaces.set(id, workspace);
  return workspace;
}

/**
 * Get changed files in a worktree.
 */
export async function getChangedFiles(workspaceId: string): Promise<string[]> {
  const ws = agentWorkspaces.get(workspaceId);
  if (!ws) throw new Error(`Workspace not found: ${workspaceId}`);

  try {
    const output = await execGit(
      ["diff", "--name-only", "HEAD"],
      ws.worktreePath,
      "worktree-manager",
      { agentRunId: ws.agentRunId, projectId: ws.projectId },
    );
    const files = output.trim().split("\n").filter(Boolean);
    ws.changedFiles = files;
    ws.updatedAt = new Date().toISOString();
    return files;
  } catch {
    return ws.changedFiles;
  }
}

/**
 * Mark a workspace as completed.
 */
export async function completeWorkspace(workspaceId: string): Promise<void> {
  const ws = agentWorkspaces.get(workspaceId);
  if (!ws) throw new Error(`Workspace not found: ${workspaceId}`);

  ws.changedFiles = await getChangedFiles(workspaceId);
  ws.status = "completed";
  ws.updatedAt = new Date().toISOString();
}

/**
 * Clean up a worktree (remove from git and disk).
 */
export async function removeWorkspace(workspaceId: string): Promise<void> {
  const ws = agentWorkspaces.get(workspaceId);
  if (!ws) throw new Error(`Workspace not found: ${workspaceId}`);

  const projectWs = Array.from(projectWorkspaces.values()).find(
    (pws) => pws.projectId === ws.projectId,
  );

  if (projectWs) {
    try {
      await execGit(
        ["worktree", "remove", ws.worktreePath, "--force"],
        projectWs.repoPath,
        "worktree-manager",
        { agentRunId: ws.agentRunId, projectId: ws.projectId },
      );
    } catch {
      // Best-effort cleanup
    }
  }

  ws.status = "abandoned";
  ws.updatedAt = new Date().toISOString();
}

/**
 * Detect file conflicts between active workspaces for the same project.
 */
export async function detectConflicts(projectId: string): Promise<FileConflict[]> {
  const conflicts: FileConflict[] = [];
  const activeWorkspaces = Array.from(agentWorkspaces.values()).filter(
    (ws) => ws.projectId === projectId && ws.status === "active",
  );

  for (let i = 0; i < activeWorkspaces.length; i++) {
    for (let j = i + 1; j < activeWorkspaces.length; j++) {
      const wsA = activeWorkspaces[i];
      const wsB = activeWorkspaces[j];

      const filesA = new Set(await getChangedFiles(wsA.id));
      const filesB = new Set(await getChangedFiles(wsB.id));

      for (const file of filesA) {
        if (filesB.has(file)) {
          conflicts.push({
            filePath: file,
            workspaceA: wsA.id,
            workspaceB: wsB.id,
            agentRunA: wsA.agentRunId,
            agentRunB: wsB.agentRunId,
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * Get all workspaces for a project.
 */
export function getProjectWorkspaces(projectId: string): AgentRunWorkspace[] {
  return Array.from(agentWorkspaces.values()).filter(
    (ws) => ws.projectId === projectId,
  );
}

/**
 * Get a specific agent run workspace.
 */
export function getAgentRunWorkspace(agentRunId: string): AgentRunWorkspace | undefined {
  return Array.from(agentWorkspaces.values()).find(
    (ws) => ws.agentRunId === agentRunId,
  );
}
