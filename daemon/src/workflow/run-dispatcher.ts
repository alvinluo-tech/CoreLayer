/**
 * Run Dispatcher — orchestrates the lifecycle of agent runs.
 *
 * Coordinates queue, slots, and resource monitoring to dispatch
 * queued runs to available runtimes.
 */

import { getRepositories } from "../persistence/factory.js";
import { SlotManager } from "./slot-manager.js";
import { getResourceStatus, isResourcePressureHigh } from "./resource-monitor.js";

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

  // Get queued runs (status "running" but not completed = newly created, awaiting dispatch)
  const runs = await agentRuns.getRecent(100);
  const pendingRuns = runs.filter((r) => r.status === "running" && !r.completedAt);

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

    // Mark as actually running and acquire slot
    const acquired = slotManager.acquireAgentRun(run.id);
    if (!acquired) {
      skipped++;
      continue;
    }

    // In a real implementation, this would invoke the runtime host
    // For now, we just mark the run as dispatched
    dispatched++;
  }

  // Update queue depth tracking
  slotManager.setAgentRunQueueDepth(skipped);

  return { dispatched, skipped };
}

/**
 * Mark a run as completed and release its slot.
 */
export async function completeRun(runId: string, success: boolean, error?: string): Promise<void> {
  const { agentRuns } = getRepositories();
  const status = success ? "succeeded" : "failed";
  await agentRuns.updateStatus(runId, status, error);
  slotManager.releaseAgentRun(runId);
}

/**
 * Cancel a running or queued run.
 */
export async function cancelRun(runId: string): Promise<boolean> {
  const { agentRuns } = getRepositories();
  const run = await agentRuns.getById(runId);
  if (!run) return false;

  if (run.status === "succeeded" || run.status === "failed" || run.status === "cancelled") {
    return false; // Already terminal
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

  // Reset to queued state
  await agentRuns.updateStatus(runId, "running");
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

export { slotManager };
