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
import { resolveRunContext } from "./run-context.js";

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
  const { agentRuns, conversations, tasks, agentRunEvents } = getRepositories();
  const events: AgentRunEvent[] = [];

  // Resolve context (workspace, agent defaults)
  const context = await resolveRunContext({
    workspaceId: request.workspaceId,
    projectId: request.projectId,
    agentId: request.agentId,
  });

  let eventSequence = 0;

  const emit = (event: AgentRunEvent) => {
    events.push(event);
    options?.onEvent?.(event);
    return event;
  };

  const persistEvent = async (runId: string, event: AgentRunEvent) => {
    const seq = eventSequence++;
    await agentRunEvents.create({
      runId,
      sequence: seq,
      type: event.type,
      payload: event,
    }).catch(() => { /* best-effort */ });
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
    const conv = await conversations.create(
      request.mode === "voice" ? "Voice Chat" : "New Chat",
      { workspaceId: context.workspaceId, projectId: context.projectId },
    );
    conversationId = conv.id;
  }

  const run = await agentRuns.create({
    conversationId,
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    taskId: request.taskId,
    agentId: context.agentId,
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
  await persistEvent(run.id, { type: "run_started", runId: run.id, mode: request.mode });

  try {
    const result = await handleMessageInConversation(
      conversationId,
      request.input,
      {
        modelOverride: request.modelOverride,
        runtimeContext: {
          runId: run.id,
          projectId: request.projectId,
          mode: request.mode,
        },
      },
    );

    const conversation = await conversations.getById(conversationId);
    emit({
      type: "run_completed",
      result: {
        text: result.assistantMessage.content,
        conversationId,
        userMessage: result.userMessage,
        assistantMessage: result.assistantMessage,
        conversation,
      },
    });
    await persistEvent(run.id, {
      type: "run_completed",
      result: { text: result.assistantMessage.content, conversationId, userMessage: result.userMessage, assistantMessage: result.assistantMessage, conversation },
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
      userMessage: result.userMessage,
      assistantMessage: result.assistantMessage,
      conversation,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logError("runTurn", err);
    emit({ type: "run_failed", error: errorMsg });
    await persistEvent(run.id, { type: "run_failed", error: errorMsg });
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
