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
import { createEventEmitter, handleApprovalSuspension } from "./application/run-events.js";

export type RunTurnOptions = {
  onEvent?: (event: AgentRunEvent) => void;
  abortController?: AbortController;
};

/**
 * Module-level registry of active run AbortControllers.
 * Allows external cancel (e.g. HTTP POST /runs/:id/cancel) to abort
 * an in-flight runTurn without needing a reference to the runtime instance.
 */
const activeRunControllers = new Map<string, AbortController>();

export function cancelActiveRun(runId: string): boolean {
  const controller = activeRunControllers.get(runId);
  if (!controller) return false;
  controller.abort();
  return true;
}

export function registerActiveRun(runId: string, controller: AbortController): void {
  activeRunControllers.set(runId, controller);
}

export function unregisterActiveRun(runId: string): void {
  activeRunControllers.delete(runId);
}

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

  let emitAndPersist = (event: AgentRunEvent) => {
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

  const baseEmit = createEventEmitter(run.id, agentRunEvents, options?.onEvent);
  emitAndPersist = (event: AgentRunEvent) => {
    events.push(event);
    baseEmit(event);
    return event;
  };

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

  // Register abort controller for external cancellation
  if (options?.abortController) {
    activeRunControllers.set(run.id, options.abortController);
  }

  try {
    const result = await handleMessageInConversation(
      conversationId,
      request.input,
      {
        modelOverride: request.modelOverride,
        providerOverride: request.providerOverride,
        systemPromptOverride: request.systemPromptOverride,
        abortController: options?.abortController,
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
      await handleApprovalSuspension(run.id, result.approvalRequestIds ?? [], emitAndPersist, agentRuns);

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
    const isCancelled = options?.abortController?.signal.aborted === true;
    const finalStatus = isCancelled ? "cancelled" : "failed";
    logError("runTurn", err);
    emitAndPersist({ type: "run_failed", error: errorMsg });
    await agentRuns.updateStatus(run.id, finalStatus, errorMsg);

    if (request.taskId) {
      const task = await tasks.getById(request.taskId);
      if (task) {
        const runHistory = Array.isArray(task.runHistory) ? task.runHistory : [];
        await tasks.update(request.taskId, {
          status: finalStatus,
          runHistory: updateLastRunHistoryEntry(runHistory, {
            status: finalStatus,
            error: errorMsg,
            completedAt: new Date().toISOString(),
          }),
        });
      }
    }

    throw err;
  } finally {
    activeRunControllers.delete(run.id);
  }
}
