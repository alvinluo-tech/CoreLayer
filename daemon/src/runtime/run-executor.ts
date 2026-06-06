/**
 * Unified Agent Run executor.
 *
 * Wraps the existing conversation.ts functions to provide a single `runTurn`
 * entry point. Each run creates an AgentRun record and emits structured events.
 */

import type {
  AgentRunRequest,
  AgentRunEvent,
  AgentRunResult,
} from "./agent-run.js";
import { getRepositories } from "../db/factory.js";
import { handleMessageInConversation } from "../orchestrator/conversation.js";
import { logError } from "../utils/errors.js";

export type RunTurnOptions = {
  onEvent?: (event: AgentRunEvent) => void;
};

/**
 * Unified entry point for all agent execution.
 *
 * Creates an AgentRun record, delegates to the appropriate conversation
 * handler, and emits structured events throughout the lifecycle.
 */
export async function runTurn(
  request: AgentRunRequest,
  options?: RunTurnOptions,
): Promise<AgentRunResult> {
  const { agentRuns, conversations } = getRepositories();
  const events: AgentRunEvent[] = [];

  // Ensure conversation exists (create if needed)
  let conversationId = request.conversationId;
  if (!conversationId) {
    const conv = await conversations.create("New Chat");
    conversationId = conv.id;
  }

  // Create AgentRun record
  const run = await agentRuns.create({
    conversationId,
    workspaceId: request.workspaceId,
    projectId: request.projectId,
    taskId: request.taskId,
    agentId: request.agentId,
    mode: request.mode,
    selectedModel: request.modelOverride ?? undefined,
  });

  const emit = (event: AgentRunEvent) => {
    events.push(event);
    options?.onEvent?.(event);
    return event;
  };

  emit({ type: "run_started", runId: run.id, mode: request.mode });

  try {
    // Delegate to existing conversation handler
    const result = await handleMessageInConversation(
      conversationId,
      request.input,
      { modelOverride: request.modelOverride },
    );

    emit({
      type: "run_completed",
      result: {
        text: result.assistantMessage.content,
        conversationId,
      },
    });

    // Update AgentRun to succeeded
    await agentRuns.updateStatus(run.id, "succeeded");

    return {
      runId: run.id,
      conversationId,
      text: result.assistantMessage.content,
      events,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logError("runTurn", err);
    emit({ type: "run_failed", error: errorMsg });
    await agentRuns.updateStatus(run.id, "failed", errorMsg);
    throw err;
  }
}
