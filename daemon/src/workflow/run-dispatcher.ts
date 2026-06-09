/**
 * Run Dispatcher — orchestrates the lifecycle of agent runs.
 *
 * Coordinates queue, slots, and resource monitoring to dispatch
 * queued runs to available runtimes.
 */

import { getRepositories } from "../persistence/factory.js";
import { SlotManager } from "./slot-manager.js";
import { getResourceStatus, isResourcePressureHigh } from "./resource-monitor.js";
import { getCodingRuntime } from "../runtimes/coding/registry.js";
import type { CodingTask } from "../runtimes/coding/types.js";
import { isAgentExecutorPolicy } from "../shared/agent-profile-types.js";
import { TaskGraph } from "../workspaces/task-graph-service.js";
import { enqueue } from "./queue-service.js";

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

    // Transition queued → running
    await agentRuns.updateStatus(run.id, "running");

    // Dispatch to coding executor
    dispatchToCodingRuntime(run.id, run.agentId, run.taskId).catch((err) => {
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
  runId: string,
  agentId: string | null,
  taskId: string | null,
): Promise<void> {
  const { agentRuns, agentProfiles, tasks } = getRepositories();

  // Resolve adapter ID from agent profile's executor policy
  let adapterId = "claude-code"; // default
  let workDir: string | undefined;

  if (agentId) {
    const profile = await agentProfiles.getById(agentId);
    if (profile?.executorPolicy && isAgentExecutorPolicy(profile.executorPolicy)) {
      if (profile.executorPolicy.executor === "self") {
        throw new Error("Executor 'self' is not supported for coding tasks — use 'claude-code', 'codex', or 'opencode'");
      }
      adapterId = profile.executorPolicy.executor;
      workDir = profile.executorPolicy.workDir;
    }
  }

  const adapter = getCodingRuntime(adapterId);
  if (!adapter) {
    throw new Error(`Unknown coding adapter: ${adapterId}`);
  }

  // Build CodingTask from task + run info
  let taskPrompt = `Execute agent run ${runId}`;
  const repoPath = workDir ?? process.cwd();

  if (taskId) {
    const task = await tasks.getById(taskId);
    if (task) {
      taskPrompt = task.objective ?? task.description ?? task.title;
      // TODO: task may have a repoPath field in the future
    }
  }

  const codingTask: CodingTask = {
    dbRunId: runId,
    repoPath,
    taskPrompt,
    timeoutMs: 300_000, // 5 min default
  };

  // Create run via adapter — adapter will spawn subprocess
  const codingRun = await adapter.createRun(codingTask);

  // Persist artifacts when adapter completes
  const pollCompletion = async (): Promise<void> => {
    const maxWait = codingTask.timeoutMs! + 10_000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const info = await adapter.getRunStatus(codingRun.runId);
      if (info.status === "succeeded" || info.status === "failed" || info.status === "cancelled") {
        await agentRuns.updateArtifacts(runId, info.artifacts);

        // Sync coding artifacts to the artifacts table
        if (info.artifacts.length > 0) {
          const runRecord = await agentRuns.getById(runId);
          await syncArtifactsToTable(runId, info.artifacts, runRecord?.workspaceId ?? null, runRecord?.projectId ?? null);
        }

        await completeRun(runId, info.status === "succeeded", info.error);
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    // Timeout — mark as failed
    await completeRun(runId, false, "Coding run timed out");
  };

  pollCompletion().catch(() => {
    // Best-effort completion tracking
  });
}

/**
 * Mark a run as completed, update task status, unlock dependents, and enqueue newly ready tasks.
 */
export async function completeRun(runId: string, success: boolean, error?: string): Promise<void> {
  const { agentRuns, tasks } = getRepositories();
  const status = success ? "succeeded" : "failed";
  await agentRuns.updateStatus(runId, status, error);
  slotManager.releaseAgentRun(runId);

  // Update the associated task status
  const run = await agentRuns.getById(runId);
  if (run?.taskId) {
    const task = await tasks.getById(run.taskId);
    if (task) {
      const taskStatus = success ? "completed" : "failed";
      await tasks.update(run.taskId, {
        status: taskStatus,
        ...(success ? { completedAt: new Date().toISOString() } : {}),
      });

      // If task succeeded, unlock downstream tasks and enqueue newly ready ones
      if (success && task.projectId) {
        await taskGraph.completeTask(run.taskId);

        // Find and enqueue any tasks that are now unblocked
        const executableTasks = await taskGraph.getExecutableTasks(task.projectId);
        for (const readyTask of executableTasks) {
          if (readyTask.status === "queued" && !readyTask.assignedAgentId) {
            // Assign an agent and enqueue
            await tasks.update(readyTask.id, {
              assignedAgentId: run.agentId ?? undefined,
            });
            await enqueue({
              taskId: readyTask.id,
              agentId: run.agentId ?? undefined,
              workspaceId: readyTask.workspaceId ?? undefined,
              projectId: readyTask.projectId ?? undefined,
              mode: "workflow",
            });
          }
        }
      }
    }
  }
}

/**
 * Cancel a running or queued run.
 * Also kills the external process if one was spawned.
 */
export async function cancelRun(runId: string): Promise<boolean> {
  const { agentRuns, agentProfiles } = getRepositories();
  const run = await agentRuns.getById(runId);
  if (!run) return false;

  if (run.status === "succeeded" || run.status === "failed" || run.status === "cancelled") {
    return false; // Already terminal
  }

  // Try to kill the external process via the adapter
  if (run.agentId) {
    try {
      const profile = await agentProfiles.getById(run.agentId);
      if (profile?.executorPolicy && isAgentExecutorPolicy(profile.executorPolicy)) {
        const adapterId = profile.executorPolicy.executor === "self" ? "claude-code" : profile.executorPolicy.executor;
        const adapter = getCodingRuntime(adapterId);
        if (adapter) {
          await adapter.cancelRun(runId).catch(() => {});
        }
      }
    } catch {
      // Best-effort process kill — DB update still proceeds
    }
  }

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
  artifacts: Array<{ type: string; metadata?: Record<string, unknown> }>,
  workspaceId: string | null,
  projectId: string | null,
): Promise<void> {
  if (!workspaceId) return;

  const { db, schema } = await import("../persistence/client.js");

  for (const artifact of artifacts) {
    const title = artifact.metadata?.title
      ?? artifact.metadata?.file
      ?? `${artifact.type} artifact`;

    await db.insert(schema.artifacts).values({
      id: crypto.randomUUID(),
      workspaceId,
      projectId: projectId ?? undefined,
      runId,
      type: artifact.type === "changed_files" ? "file" : "report",
      title: String(title),
      content: artifact.metadata ? JSON.stringify(artifact.metadata) : null,
    }).catch(() => {
      // Best-effort — don't fail the run over artifact persistence
    });
  }
}

export { slotManager };
