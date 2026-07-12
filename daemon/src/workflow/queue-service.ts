/**
 * Queue Service — manages the durable execution queue for agent runs.
 *
 * Entries are persisted to the agent_runs table with status "queued".
 * Provides FIFO ordering and status tracking.
 */

import { getRepositories } from "../persistence/factory.js";
import type { AgentRunRow } from "../persistence/repository.js";
import type { AgentRunSnapshot } from "../persistence/repository/agent.js";
import { dispatchRuns } from "./run-dispatcher.js";
import { createHash } from "node:crypto";

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
  workspaceId?: string;
  projectId?: string;
  conversationId?: string;
  mode?: AgentRunRow["mode"];
  selectedModel?: string;
}): Promise<QueueEntry> {
  const { agentRuns, agentProfiles } = getRepositories();
  let agentSnapshot: AgentRunSnapshot | null = null;
  if (input.agentId) {
    const profile = await agentProfiles.getById(input.agentId);
    if (profile) {
      const snapshotPayload = {
        capabilities: [...profile.capabilities],
        skills: [...profile.skills],
        tools: [...profile.tools],
        knowledgeScopes: [...profile.knowledgeScopes],
        permissions: [...profile.permissions],
        memoryScopes: [...profile.memoryScopes],
        modelPolicy: structuredClone(profile.modelPolicy),
        executorPolicy: profile.executorPolicy ? structuredClone(profile.executorPolicy) : null,
      };
      agentSnapshot = {
        profileId: profile.id,
        profileUpdatedAt: profile.updatedAt,
        profileDigest: createHash("sha256").update(JSON.stringify(snapshotPayload)).digest("hex"),
        ...snapshotPayload,
      };
    }
  }
  const run = await agentRuns.create({
    taskId: input.taskId,
    agentId: input.agentId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    conversationId: input.conversationId,
    mode: input.mode ?? "chat",
    selectedModel: input.selectedModel,
    agentSnapshot,
  });

  // Trigger dispatch immediately so queued runs don't wait for a tick
  triggerDispatch();

  return {
    runId: run.id,
    taskId: run.taskId,
    agentId: run.agentId,
    priority: 0,
    enqueuedAt: run.startedAt,
  };
}

/**
 * Trigger dispatch after enqueue. Non-blocking — errors are logged but don't propagate.
 */
async function triggerDispatch(): Promise<void> {
  try {
    await dispatchRuns();
  } catch {
    // Dispatch is best-effort; failures will be caught on next tick
  }
}

/**
 * Dequeue the next runnable entry.
 * Returns the oldest queued run (FIFO), or null if queue is empty.
 */
export async function dequeue(): Promise<AgentRunRow | null> {
  const { agentRuns } = getRepositories();
  const queued = await agentRuns.getQueued(1);
  return queued[0] ?? null;
}

/**
 * Get all queued entries in FIFO order.
 */
export async function getQueue(): Promise<AgentRunRow[]> {
  const { agentRuns } = getRepositories();
  return agentRuns.getQueued(100);
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
