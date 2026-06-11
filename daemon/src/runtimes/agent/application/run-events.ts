/**
 * Shared helpers for run.ts and stream.ts.
 * Deduplicates event emission, approval suspension, and conversation creation.
 */

import type { AgentRunEvent } from "../domain/agent-run.js";
import type { AgentRunRepository, AgentRunEventRepository } from "../../../persistence/repository.js";
import { logError } from "../../../shared/errors.js";

/**
 * Factory for emitAndPersist — creates an event emitter that persists
 * non-delta events to the agentRunEvents repository.
 *
 * @param runId - The run ID to associate events with
 * @param agentRunEvents - The events repository
 * @param onEvent - Optional external event callback
 * @returns A function that emits and persists an event
 */
export function createEventEmitter(
  runId: string,
  agentRunEvents: AgentRunEventRepository,
  onEvent?: (event: AgentRunEvent) => void,
): (event: AgentRunEvent) => AgentRunEvent {
  let eventSequence = 0;

  return (event: AgentRunEvent) => {
    onEvent?.(event);
    if (event.type !== "delta") {
      const seq = eventSequence++;
      agentRunEvents
        .create({
          runId,
          sequence: seq,
          type: event.type,
          payload: event,
        })
        .catch((err) => logError("agentRunEvents/create", err));
    }
    return event;
  };
}

/**
 * Handle approval suspension: emit run_suspended and update run status.
 */
export async function handleApprovalSuspension(
  runId: string,
  approvalRequestIds: string[],
  emit: (event: AgentRunEvent) => AgentRunEvent,
  agentRuns: AgentRunRepository,
): Promise<void> {
  emit({
    type: "run_suspended",
    runId,
    reason: "approval_required",
    approvalRequestIds,
  });
  await agentRuns.updateStatus(runId, "waiting_for_approval");
}
