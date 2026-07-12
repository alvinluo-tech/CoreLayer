/**
 * Run Dispatcher — orchestrates the lifecycle of agent runs.
 *
 * Coordinates queue, slots, and resource monitoring to dispatch
 * queued runs to available runtimes.
 */

import { getRepositories } from "../persistence/factory.js";
import { SlotManager } from "./slot-manager.js";
import { getResourceStatus, isResourcePressureHigh } from "./resource-monitor.js";
import type { ExecutorArtifact } from "@jarvis/runtime-protocol";
import type { CodingArtifact } from "../runtimes/coding/types.js";
import { isPersistableCodingArtifact } from "../runtimes/coding/artifact-persistence.js";
import { isAgentExecutorPolicy } from "../shared/agent-profile-types.js";
import { TaskGraph } from "../workspaces/task-graph-service.js";
import { cancelActiveRun } from "../runtimes/agent/run.js";
import { enqueue } from "./queue-service.js";
import {
  cancelExecutorAttempt,
  executeExecutorAttempt,
  selectExecutorForAttempt,
} from "./executor-lifecycle-service.js";
import { reconcileWorkspaceStatus } from "../workspaces/workspace-completion.js";
import type { AgentRunRow } from "../persistence/repository/agent.js";
import { parseCompletionPolicy } from "./completion-policy.js";

const taskGraph = new TaskGraph();

export interface DispatchResult {
  dispatched: number;
  skipped: number;
  reason?: string;
}

const slotManager = new SlotManager();

/**
 * Attempt to dispatch queued runs.
 * Called on a tick or trigger basis.
 */
export async function dispatchRuns(): Promise<DispatchResult> {
  const { agentRuns } = getRepositories();

  // Check resource pressure
  if (isResourcePressureHigh()) {
    return { dispatched: 0, skipped: 0, reason: "High resource pressure — deferring dispatch" };
  }

  // Check slot availability
  if (!slotManager.canStartAgentRun()) {
    return { dispatched: 0, skipped: 0, reason: "All agent run slots occupied" };
  }

  // Get queued runs awaiting dispatch (FIFO order by createdAt)
  const pendingRuns = await agentRuns.getQueued(100);

  if (pendingRuns.length === 0) {
    return { dispatched: 0, skipped: 0 };
  }

  let dispatched = 0;
  let skipped = 0;

  for (const run of pendingRuns) {
    if (!slotManager.canStartAgentRun()) {
      skipped++;
      continue;
    }

    // Check task dependencies before dispatching
    if (run.taskId) {
      const canExecute = await taskGraph.canExecute(run.taskId);
      if (!canExecute) {
        skipped++;
        continue;
      }
    }

    // Mark as actually running and acquire slot
    const acquired = slotManager.acquireAgentRun(run.id);
    if (!acquired) {
      skipped++;
      continue;
    }

    // Atomically claim queued → running. Another dispatcher may have won the race.
    const claimed = await agentRuns.claimQueued(run.id);
    if (!claimed) {
      slotManager.releaseAgentRun(run.id);
      skipped++;
      continue;
    }

    // Dispatch to coding executor
    dispatchToCodingRuntime(run).catch((err) => {
      // If dispatch fails, mark run as failed and release slot
      completeRun(run.id, false, err instanceof Error ? err.message : String(err));
    });

    dispatched++;
  }

  // Update queue depth tracking
  slotManager.setAgentRunQueueDepth(skipped);

  return { dispatched, skipped };
}

/**
 * Dispatch a single run to the coding runtime based on the agent's executor policy.
 */
async function dispatchToCodingRuntime(
  runRecord: AgentRunRow,
): Promise<void> {
  const { agentRuns, agentProfiles, tasks, projects } = getRepositories();
  const runId = runRecord.id;
  const agentId = runRecord.agentId;
  const taskId = runRecord.taskId;

  // Resolve adapter ID from agent profile's executor policy
  let preferredAdapterId: string | undefined;
  let workDir: string | undefined;

  const profile = agentId ? await agentProfiles.getById(agentId) : null;
  const executorPolicy = runRecord.agentSnapshot?.executorPolicy ?? profile?.executorPolicy;
  if (executorPolicy && isAgentExecutorPolicy(executorPolicy)) {
      if (executorPolicy.executor === "self") {
        throw new Error("Executor 'self' is not supported for coding tasks — use 'claude-code', 'codex', or 'opencode'");
      }
      preferredAdapterId = executorPolicy.executor;
      workDir = executorPolicy.workDir;
  }

  // Resolve project root path
  let projectRootPath: string | undefined;
  if (runRecord?.projectId) {
    const project = await projects.getById(runRecord.projectId);
    if (project?.rootPath) {
      projectRootPath = project.rootPath;
    }
  }

  // Build CodingTask from task + run info
  let taskPrompt = `Execute agent run ${runId}`;
  const repoPath = workDir ?? projectRootPath ?? process.cwd();
  let completionPolicy = parseCompletionPolicy([]);

  if (taskId) {
    const task = await tasks.getById(taskId);
    if (task) {
      taskPrompt = task.objective ?? task.description ?? task.title;
      completionPolicy = parseCompletionPolicy(task.acceptanceCriteria);
      // TODO: task may have a repoPath field in the future
    }
  }

  const permissions = runRecord.agentSnapshot?.permissions ?? profile?.permissions ?? [];
  const permissionPolicy = permissions.includes("unrestricted")
    ? "permissive"
    : permissions.includes("write")
      ? "normal"
      : "strict";
  const selection = await selectExecutorForAttempt({
    preferredAdapterId,
    permissionPolicy,
    requireIsolation: true,
  });
  await agentRuns.updateRouting(runId, selection.routeReason);

  const outcome = await executeExecutorAttempt({
    agentRunId: runId,
    workspaceId: runRecord.workspaceId ?? undefined,
    projectId: runRecord.projectId ?? undefined,
    taskId: taskId ?? undefined,
    agentId: agentId ?? "unassigned",
    adapterId: selection.adapterId,
    taskPrompt,
    workingDirectory: repoPath,
    timeoutMs: 300_000,
    permissionPolicy,
    testCommands: completionPolicy.testCommands,
    requiredArtifactTypes: completionPolicy.requiredArtifactTypes,
    allowedPaths: completionPolicy.allowedPaths,
    manualCriteria: completionPolicy.manualCriteria,
    allowedTools: runRecord.agentSnapshot?.tools ?? profile?.tools ?? [],
  });

  await agentRuns.updateArtifacts(runId, outcome.artifacts.artifacts);
  if (outcome.artifacts.artifacts.length > 0) {
    await syncArtifactsToTable(
      runId,
      outcome.artifacts.artifacts,
      runRecord.workspaceId,
      runRecord.projectId,
    );
  }
  await completeRun(runId, outcome.success, outcome.error, outcome.manualInterventionRequired);
}

/**
 * Mark a run as completed, update task status, unlock dependents, and enqueue newly ready tasks.
 */
export async function completeRun(
  runId: string,
  success: boolean,
  error?: string,
  manualInterventionRequired = false,
): Promise<void> {
  const { agentRuns, tasks } = getRepositories();
  const status = success ? "succeeded" : "failed";
  await agentRuns.updateStatus(runId, status, error);
  slotManager.releaseAgentRun(runId);

  // Update the associated task status
  const run = await agentRuns.getById(runId);
  if (run?.taskId) {
    const task = await tasks.getById(run.taskId);
    if (task) {
      const taskStatus = success ? "completed" : manualInterventionRequired ? "blocked" : "failed";
      await tasks.update(run.taskId, {
        status: taskStatus,
        ...(manualInterventionRequired ? { manualInterventionRequired: true } : {}),
        ...(success ? { completedAt: new Date().toISOString() } : {}),
        runHistory: [
          ...(task.runHistory ?? []),
          { runId, status, error: error ?? null, completedAt: new Date().toISOString() },
        ],
      });

      // If task succeeded, unlock downstream tasks and enqueue newly ready ones
      if (success && task.projectId) {
        await taskGraph.completeTask(run.taskId);

        // Find and enqueue any tasks that are now unblocked
        const executableTasks = await taskGraph.getExecutableTasks(task.projectId);
        for (const readyTask of executableTasks) {
          if (readyTask.status === "queued") {
            const assignedAgentId = readyTask.assignedAgentId ?? run.agentId ?? undefined;
            if (!readyTask.assignedAgentId && assignedAgentId) {
              await tasks.update(readyTask.id, { assignedAgentId });
            }
            await enqueue({
              taskId: readyTask.id,
              agentId: assignedAgentId,
              workspaceId: readyTask.workspaceId ?? undefined,
              projectId: readyTask.projectId ?? undefined,
              mode: "workflow",
            });
          }
        }
      }
    }
  }

  if (run?.workspaceId) {
    await reconcileWorkspaceStatus(run.workspaceId);
  }
}

/**
 * Cancel a running or queued run.
 * Also kills the external process if one was spawned.
 */
export async function cancelRun(runId: string): Promise<boolean> {
  const { agentRuns } = getRepositories();
  const run = await agentRuns.getById(runId);
  if (!run) return false;

  if (run.status === "succeeded" || run.status === "failed" || run.status === "cancelled") {
    return false; // Already terminal
  }

  // Abort any in-flight runTurn for this run
  cancelActiveRun(runId);

  await cancelExecutorAttempt(runId).catch(() => false);

  await agentRuns.updateStatus(runId, "cancelled");
  slotManager.releaseAgentRun(runId);
  return true;
}

/**
 * Retry a failed run.
 */
export async function retryRun(runId: string): Promise<boolean> {
  const { agentRuns } = getRepositories();
  const run = await agentRuns.getById(runId);
  if (!run) return false;

  if (run.status !== "failed") {
    return false; // Can only retry failed runs
  }

  // Reset to queued state so dispatcher picks it up
  await agentRuns.updateStatus(runId, "queued");
  return true;
}

/**
 * Get current dispatcher status.
 */
export function getDispatcherStatus() {
  return {
    slots: slotManager.getUsage(),
    resources: getResourceStatus(),
  };
}

/**
 * Sync coding run artifacts to the first-class artifacts table.
 * This ensures workspace detail views can display them.
 */
async function syncArtifactsToTable(
  runId: string,
  artifacts: ExecutorArtifact[],
  workspaceId: string | null,
  projectId: string | null,
): Promise<void> {
  if (!workspaceId) return;

  const { db, schema } = await import("../persistence/client.js");

  for (const artifact of artifacts) {
    if (!isPersistableCodingArtifact(artifact as CodingArtifact)) {
      continue;
    }

    const title = artifact.metadata?.title
      ?? artifact.metadata?.file
      ?? `${artifact.type} artifact`;

    const artifactMetadata = {
      artifactClass: "deliverable",
      domain: "coding",
      source: "executor",
      runId,
    };

    await db.insert(schema.artifacts).values({
      id: crypto.randomUUID(),
      workspaceId,
      projectId: projectId ?? undefined,
      runId,
      type: artifact.type === "changed_files" ? "file" : "report",
      title: String(title),
      content: artifact.content ?? (artifact.metadata ? JSON.stringify(artifact.metadata) : null),
      metadata: JSON.stringify(artifactMetadata),
    }).catch(() => {
      // Best-effort — don't fail the run over artifact persistence
    });
  }
}

export { slotManager };
