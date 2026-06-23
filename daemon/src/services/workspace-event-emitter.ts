/**
 * Workspace Event Emitter — single backend helper for writing structured
 * workspace timeline events to the event_log table.
 *
 * Business modules call emitWorkspaceEvent() instead of hand-rolling
 * eventLog.create() payloads. This keeps event envelopes consistent
 * and centralizes error handling so observability never breaks execution.
 */

import { getRepositories } from "../persistence/factory.js";
import { logError } from "../shared/errors.js";
import type {
  EmitWorkspaceEventInput,
  EventSeverity,
} from "./workspace-event-types.js";

/**
 * Emit a structured workspace event to the event log.
 *
 * Normalizes the envelope, attaches consistent metadata, and writes
 * through the event log repository. Fails silently — callers should
 * never need to catch or await this for control flow.
 */
export async function emitWorkspaceEvent(
  input: EmitWorkspaceEventInput,
): Promise<void> {
  try {
    const { eventLog } = getRepositories();

    const severity: EventSeverity = input.severity ?? "info";
    const actor = input.actor ?? "system";

    await eventLog.create({
      type: input.type,
      projectId: input.projectId ?? null,
      taskId: input.taskId ?? null,
      agentRunId: input.agentRunId ?? null,
      runtimeId: input.runtimeId ?? null,
      payload: {
        title: input.title,
        summary: input.summary ?? null,
        severity,
        actor,
        ...(input.artifactId ? { artifactId: input.artifactId } : {}),
        ...input.payload,
      },
    });
  } catch (err) {
    // Observability must never break execution flow
    logError("workspace-event-emitter", err);
  }
}
