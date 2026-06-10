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
} from "./domain/agent-run.js";
import { getRepositories } from "../../persistence/factory.js";
import { handleMessageInConversation } from "./application/conversation.js";
import { logError } from "../../shared/errors.js";
import { TaskGraph } from "../../workspaces/task-graph-service.js";
import { resolveConversationScope } from "./run-context.js";

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

  // Resolve context from conversation scope (existing conversation fields win)
  const context = await resolveConversationScope({
    conversationId: request.conversationId,
    workspaceId: request.workspaceId,
    projectId: request.projectId,
    taskId: request.taskId,
    agentId: request.agentId,
  });

  let eventSequence = 0;
  let currentRunId = "";

  const emitAndPersist = (event: AgentRunEvent) => {
    events.push(event);
    options?.onEvent?.(event);
    if (event.type !== "delta" && currentRunId) {
      const seq = eventSequence++;
      agentRunEvents.create({
        runId: currentRunId,
        sequence: seq,
        type: event.type,
        payload: event,
      }).catch((err) => logError("agentRunEvents/create", err));
    }
    return event;
  };

  if (request.taskId) {
    const task = await tasks.getById(request.taskId);
    if (task) {
      const blockedBy = await taskGraph.getIncompleteDependencies(request.taskId);
      if (blockedBy.length > 0) {
        await tasks.update(request.taskId, { status: "blocked", blockedBy });
        emitAndPersist({ type: "task_blocked", taskId: request.taskId, blockedBy });
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

  currentRunId = run.id;

  if (request.taskId) {
    const task = await tasks.getById(request.taskId);
    if (task) {
      const runHistory = Array.isArray(task.runHistory) ? task.runHistory : [];
      await tasks.update(request.taskId, {
        runHistory: updateLastRunHistoryEntry(runHistory, { runId: run.id }),
      });
    }
  }

  emitAndPersist({ type: "run_started", runId: run.id, mode: request.mode });

  try {
    const result = await handleMessageInConversation(
      conversationId,
      request.input,
      {
        modelOverride: request.modelOverride,
        providerOverride: request.providerOverride,
        systemPromptOverride: request.systemPromptOverride,
        runtimeContext: {
          runId: run.id,
          projectId: context.projectId,
          mode: request.mode,
        },
        onMemoryRead: (memoryIds) => emitAndPersist({ type: "memory_read", memoryIds }),
        onMemoryWritten: (memoryIds) => emitAndPersist({ type: "memory_written", memoryIds }),
      },
    );

    // If the run was suspended due to approval required, set waiting_for_approval
    // status and emit run_suspended instead of run_completed.
    if (result.suspended) {
      emitAndPersist({
        type: "run_suspended",
        runId: run.id,
        reason: "approval_required",
        approvalRequestIds: result.approvalRequestIds ?? [],
      });
      await agentRuns.updateStatus(run.id, "waiting_for_approval");

      return {
        runId: run.id,
        conversationId,
        text: "",
        events,
        userMessage: result.userMessage,
        assistantMessage: result.assistantMessage,
        conversation: result.conversation,
      };
    }

    const conversation = await conversations.getById(conversationId);
    emitAndPersist({
      type: "run_completed",
      result: {
        text: result.assistantMessage.content,
        conversationId,
        userMessage: result.userMessage,
        assistantMessage: result.assistantMessage,
        conversation,
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
      userMessage: result.userMessage,
      assistantMessage: result.assistantMessage,
      conversation,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logError("runTurn", err);
    emitAndPersist({ type: "run_failed", error: errorMsg });
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
