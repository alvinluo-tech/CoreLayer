/**
 * Environment Integration — connects ExecutionEnvironment with coding runtime dispatch.
 *
 * Creates an environment session before executor start, passes the environment-derived
 * working directory to the adapter, and persists the linkage between executor run
 * and environment session.
 */

import type { ExecutionEnvironment, EnvironmentSession } from "@jarvis/execution-environment";
import type { CodingAgentAdapter, CodingTask } from "./types.js";
import type { CodingRunHandle } from "./types.js";
import { GitWorktreeEnvironment } from "./git-worktree-environment.js";
import { getRepositories } from "../../persistence/factory.js";
import { emitWorkspaceEvent } from "../../services/workspace-event-emitter.js";

/** Singleton coding environment */
let codingEnvironment: ExecutionEnvironment | null = null;

export function getCodingEnvironment(): ExecutionEnvironment {
  if (!codingEnvironment) {
    codingEnvironment = new GitWorktreeEnvironment();
  }
  return codingEnvironment;
}

export interface EnvironmentDispatchInput {
  runId: string;
  agentId: string;
  workspaceId?: string;
  projectId?: string;
  taskId?: string;
  taskPrompt: string;
  repoPath: string;
  branchName?: string;
  timeoutMs?: number;
}

export interface EnvironmentDispatchResult {
  handle: CodingRunHandle;
  environmentSession: EnvironmentSession;
}

/**
 * Dispatch a coding run through an environment session.
 *
 * 1. Creates an environment session (git worktree by default)
 * 2. Passes environment working directory to the adapter
 * 3. Persists the executor run with environment session linkage
 * 4. Emits lifecycle events
 */
export async function dispatchWithEnvironment(
  adapter: CodingAgentAdapter,
  input: EnvironmentDispatchInput,
): Promise<EnvironmentDispatchResult> {
  const env = getCodingEnvironment();
  const { executorRuns } = getRepositories();

  // 1. Create environment session
  const envSession = await env.createSession({
    workspaceId: input.workspaceId ?? "default",
    projectId: input.projectId,
    runId: input.runId,
    agentId: input.agentId,
    environmentKind: "git-worktree",
    workingDirectory: input.repoPath,
    metadata: {
      branchName: input.branchName,
      repoPath: input.repoPath,
    },
  });

  // 2. Emit run-started event with environment context
  if (input.workspaceId) {
    await emitWorkspaceEvent({
      workspaceId: input.workspaceId,
      type: "workspace.run.started",
      title: `Executor starting via ${envSession.environmentKind}`,
      payload: {
        workspaceId: input.workspaceId,
        projectId: input.projectId ?? "",
        taskId: input.taskId ?? "",
        agentRunId: input.runId,
        runtimeId: adapter.id,
        repoPath: input.repoPath,
        worktreePath: envSession.workingDirectory ?? undefined,
        timeoutMs: input.timeoutMs,
      },
    }).catch(() => {});
  }

  // 3. Persist executor run with environment session linkage
  await executorRuns.create({
    agentRunId: input.runId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    taskId: input.taskId,
    agentId: input.agentId,
    adapterId: adapter.id,
    domain: "coding",
    taskPrompt: input.taskPrompt,
    environmentKind: "git-worktree",
    environmentConfig: {
      sessionId: envSession.id,
      branchName: input.branchName,
    },
    workingDirectory: envSession.workingDirectory ?? input.repoPath,
    timeoutMs: input.timeoutMs,
  });

  // 4. Build coding task with environment-derived working directory
  const codingTask: CodingTask = {
    dbRunId: input.runId,
    repoPath: input.repoPath,
    worktreePath: envSession.workingDirectory ?? undefined,
    branchName: input.branchName,
    taskPrompt: input.taskPrompt,
    timeoutMs: input.timeoutMs,
  };

  // 5. Start the executor via adapter
  const handle = await adapter.startRun(codingTask);

  // 6. Emit run-started confirmation with handle info
  // (the workspace.run.started event was already emitted above with environment context)

  return { handle, environmentSession: envSession };
}

/**
 * Cleanup an environment session after executor completes.
 */
export async function cleanupEnvironmentSession(sessionId: string): Promise<void> {
  const env = getCodingEnvironment();
  try {
    await env.dispose(sessionId);
  } catch {
    // Best-effort cleanup
  }
}
