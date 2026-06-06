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
import { TaskGraph } from "../task/task-graph.js";

export type RunTurnOptions = {
  onEvent?: (event: AgentRunEvent) => void;
};

const taskGraph = new TaskGraph();

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
  const { agentRuns, conversations, tasks } = getRepositories();
  const events: AgentRunEvent[] = [];

  // If a taskId is provided, check if the task can execute
  if (request.taskId) {
    const task = await tasks.getById(request.taskId);
    if (task) {
      const canExecute = await taskGraph.canExecute(request.taskId);
      if (!canExecute) {
        throw new Error(
          `Task ${request.taskId} is blocked by incomplete dependencies`,
        );
      }

      // Update task status to running
      await tasks.update(request.taskId, { status: "running" });

      // Append this run to the task's run history
      const runHistory = Array.isArray(task.runHistory) ? task.runHistory : [];
      await tasks.update(request.taskId, {
        runHistory: [...runHistory, { runId: "pending", startedAt: new Date().toISOString() }],
      });
    }
  }

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

  // Update the run history entry with the actual run ID
  if (request.taskId) {
    const task = await tasks.getById(request.taskId);
    if (task) {
      const runHistory = Array.isArray(task.runHistory) ? [...task.runHistory] : [];
      if (runHistory.length > 0) {
        const lastEntry = runHistory[runHistory.length - 1] as Record<string, unknown>;
        lastEntry.runId = run.id;
        await tasks.update(request.taskId, { runHistory });
      }
    }
  }

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

    // If this was a task-level run, mark the task as completed
    if (request.taskId) {
      await taskGraph.completeTask(request.taskId);
    }

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

    // If this was a task-level run, mark the task as failed
    if (request.taskId) {
      const task = await tasks.getById(request.taskId);
      if (task) {
        await tasks.update(request.taskId, { status: "failed" });
      }
    }

    throw err;
  }
}
