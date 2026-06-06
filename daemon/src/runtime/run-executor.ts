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

function appendRunHistory(
  runHistory: unknown[],
  entry: Record<string, unknown>,
): unknown[] {
  return [...runHistory, entry];
}

function updateLastRunHistoryEntry(
  runHistory: unknown[],
  patch: Record<string, unknown>,
): unknown[] {
  const next = [...runHistory];
  const last = next[next.length - 1];
  if (last && typeof last === "object") {
    next[next.length - 1] = { ...(last as Record<string, unknown>), ...patch };
  }
  return next;
}

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

  const emit = (event: AgentRunEvent) => {
    events.push(event);
    options?.onEvent?.(event);
    return event;
  };

  if (request.taskId) {
    const task = await tasks.getById(request.taskId);
    if (task) {
      const blockedBy = await taskGraph.getIncompleteDependencies(request.taskId);
      if (blockedBy.length > 0) {
        await tasks.update(request.taskId, { status: "blocked", blockedBy });
        emit({ type: "task_blocked", taskId: request.taskId, blockedBy });
        throw new Error(
          `Task ${request.taskId} is blocked by incomplete dependencies`,
        );
      }

      await tasks.update(request.taskId, { status: "running", blockedBy: [] });

      const runHistory = Array.isArray(task.runHistory) ? task.runHistory : [];
      await tasks.update(request.taskId, {
        runHistory: appendRunHistory(runHistory, {
          runId: "pending",
          status: "running",
          startedAt: new Date().toISOString(),
        }),
      });
    }
  }

  let conversationId = request.conversationId;
  if (!conversationId) {
    const conv = await conversations.create(request.mode === "voice" ? "Voice Chat" : "New Chat");
    conversationId = conv.id;
  }

  const run = await agentRuns.create({
    conversationId,
    workspaceId: request.workspaceId,
    projectId: request.projectId,
    taskId: request.taskId,
    agentId: request.agentId,
    mode: request.mode,
    selectedModel: request.modelOverride ?? undefined,
  });

  if (request.taskId) {
    const task = await tasks.getById(request.taskId);
    if (task) {
      const runHistory = Array.isArray(task.runHistory) ? task.runHistory : [];
      await tasks.update(request.taskId, {
        runHistory: updateLastRunHistoryEntry(runHistory, { runId: run.id }),
      });
    }
  }

  emit({ type: "run_started", runId: run.id, mode: request.mode });

  try {
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

    await agentRuns.updateStatus(run.id, "succeeded");

    if (request.taskId) {
      if (request.constraints?.autoCompleteTask) {
        await taskGraph.completeTask(request.taskId);
      } else {
        const task = await tasks.getById(request.taskId);
        if (task) {
          const runHistory = Array.isArray(task.runHistory) ? task.runHistory : [];
          await tasks.update(request.taskId, {
            status: "running",
            runHistory: updateLastRunHistoryEntry(runHistory, {
              status: "succeeded",
              completedAt: new Date().toISOString(),
            }),
          });
        }
      }
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

    if (request.taskId) {
      const task = await tasks.getById(request.taskId);
      if (task) {
        const runHistory = Array.isArray(task.runHistory) ? task.runHistory : [];
        await tasks.update(request.taskId, {
          status: "failed",
          runHistory: updateLastRunHistoryEntry(runHistory, {
            status: "failed",
            error: errorMsg,
            completedAt: new Date().toISOString(),
          }),
        });
      }
    }

    throw err;
  }
}
