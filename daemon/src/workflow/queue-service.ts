/**
 * Queue Service — manages the durable execution queue for agent runs.
 *
 * Entries are persisted to the agent_runs table with status "queued".
 * Provides FIFO ordering and status tracking.
 */

import { getRepositories } from "../persistence/factory.js";
import type { AgentRunRow } from "../persistence/repository.js";

export interface QueueEntry {
  runId: string;
  taskId: string | null;
  agentId: string | null;
  priority: number;
  enqueuedAt: string;
}

export interface QueueStatus {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
}

/**
 * Enqueue an agent run for execution.
 * Creates a run record with status "queued".
 */
export async function enqueue(input: {
  taskId?: string;
  agentId?: string;
  conversationId?: string;
  mode?: AgentRunRow["mode"];
  selectedModel?: string;
}): Promise<QueueEntry> {
  const { agentRuns } = getRepositories();
  const run = await agentRuns.create({
    taskId: input.taskId,
    agentId: input.agentId,
    conversationId: input.conversationId,
    mode: input.mode ?? "chat",
    selectedModel: input.selectedModel,
  });

  return {
    runId: run.id,
    taskId: run.taskId,
    agentId: run.agentId,
    priority: 0,
    enqueuedAt: run.startedAt,
  };
}

/**
 * Dequeue the next runnable entry.
 * Returns the oldest queued run, or null if queue is empty.
 */
export async function dequeue(): Promise<AgentRunRow | null> {
  const { agentRuns } = getRepositories();
  const runs = await agentRuns.getRecent(100);

  // Find the first queued run (status = queued, not yet dispatched)
  const nextQueued = runs.find((r) => {
    return r.status === "queued" && !r.completedAt;
  });

  return nextQueued ?? null;
}

/**
 * Get all queued entries.
 */
export async function getQueue(): Promise<AgentRunRow[]> {
  const { agentRuns } = getRepositories();
  const runs = await agentRuns.getRecent(100);
  return runs.filter((r) => r.status === "queued" && !r.completedAt);
}

/**
 * Remove an entry from the queue by cancelling it.
 */
export async function removeFromQueue(runId: string): Promise<boolean> {
  const { agentRuns } = getRepositories();
  const run = await agentRuns.getById(runId);
  if (!run) return false;

  if (run.status !== "queued" && run.status !== "running" || run.completedAt) {
    return false; // Can only cancel queued/running items
  }

  await agentRuns.updateStatus(runId, "cancelled");
  return true;
}

/**
 * Get queue status counts.
 */
export async function getQueueStatus(): Promise<QueueStatus> {
  const { agentRuns } = getRepositories();
  const runs = await agentRuns.getRecent(200);

  return {
    total: runs.length,
    queued: runs.filter((r) => r.status === "queued" && !r.completedAt).length,
    running: runs.filter((r) => r.status === "running" && !r.completedAt).length,
    completed: runs.filter((r) => r.status === "succeeded").length,
    failed: runs.filter((r) => r.status === "failed").length,
  };
}
