/**
 * Streaming Agent Run executor.
 *
 * Creates an AgentRun record, delegates to streamChat, and yields
 * structured AgentRunEvents throughout the streaming lifecycle.
 * Both chat and voice streaming routes converge through this entry point.
 */

import type {
  AgentRunRequest,
  AgentRunEvent,
} from "./domain/agent-run.js";
import { getRepositories } from "../../persistence/factory.js";
import { handleMessage, isAiConfigured, streamChat } from "./application/conversation.js";
import { normalizeStream } from "../../shared/stream/sse-normalizer.js";
import { withStreamTimeout } from "../../shared/stream/stream-timeout.js";
import { configManager } from "../../config/config-manager.js";
import { logError } from "../../shared/errors.js";
import { resolveConversationScope } from "./run-context.js";
import { createEventEmitter } from "./application/run-events.js";
import { registerActiveRun, unregisterActiveRun } from "./run.js";
import type { ModelMessage } from "ai";
import type { AIToolRuntimeContext } from "../tool/public-api.js";

export type RunStreamTurnOptions = {
  onEvent?: (event: AgentRunEvent) => void;
  abortController?: AbortController;
};

export interface AgentStreamRunResult {
  runId: string;
  conversationId: string;
  stream: AsyncIterable<AgentRunEvent>;
  abortController: AbortController;
}

const WATCHDOG_MS = 180_000; // 3 minutes

/**
 * Streaming entry point for all agent execution.
 *
 * Creates an AgentRun, sets up conversation, streams via streamChat,
 * and yields structured events. The caller iterates the returned stream
 * to emit SSE events or drive other consumers.
 */
export async function runStreamTurn(
  request: AgentRunRequest,
  options?: RunStreamTurnOptions,
): Promise<AgentStreamRunResult> {
  const { agentRuns, conversations, agentRunEvents } = getRepositories();

  // Resolve context from conversation scope (existing conversation fields win)
  const context = await resolveConversationScope({
    conversationId: request.conversationId,
    workspaceId: request.workspaceId,
    projectId: request.projectId,
    taskId: request.taskId,
    agentId: request.agentId,
  });

  const abortController = options?.abortController ?? new AbortController();

  // Track whether abort was triggered by watchdog vs client disconnect
  let abortedByWatchdog = false;

  // Watchdog: abort if turn takes too long
  const watchdogId = setTimeout(() => {
    abortedByWatchdog = true;
    logError("[StreamTurn] watchdog timeout", new Error(`${WATCHDOG_MS}ms exceeded`));
    abortController.abort();
  }, WATCHDOG_MS);

  // Resolve or create conversation
  let conversationId = request.conversationId;
  if (!conversationId) {
    const conv = await conversations.create(
      request.mode === "voice" ? "Voice Chat" : "New Chat",
      { workspaceId: context.workspaceId, projectId: context.projectId },
    );
    conversationId = conv.id;
  }

  // Save user message
  const savedUserMessage = await conversations.addMessage(conversationId, {
    role: "user",
    content: request.input,
  });

  // Build message history for streamChat (filter out non-user/assistant messages for type safety)
  const history = await conversations.getMessages(conversationId);
  const messages: ModelMessage[] = history
    .filter((msg) => msg.role === "user" || msg.role === "assistant")
    .slice(-20)
    .map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

  // Create AgentRun
  const run = await agentRuns.create({
    conversationId,
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    taskId: request.taskId,
    agentId: context.agentId,
    mode: request.mode,
    selectedModel: request.modelOverride ?? undefined,
  });

  // Register abort controller so POST /runs/:id/cancel can abort streaming runs
  registerActiveRun(run.id, abortController);

  // Internal state
  let fullText = "";
  const toolCallsLog: { name: string; input: unknown; output: unknown }[] = [];
  const toolCallIndexByCallId = new Map<string, number>();

  const emitAndPersist = createEventEmitter(run.id, agentRunEvents, options?.onEvent);

  // Create an asynchronous event queue to decouple streamChat execution from generator consumption
  const queue = new AsyncQueue<AgentRunEvent>();

  // Start background streaming execution
  void (async () => {
    try {
      if (!isAiConfigured()) {
        const localResult = await handleMessage(request.input);
        fullText = localResult.reply;

        for (const toolCall of localResult.toolCalls) {
          toolCallsLog.push({
            name: toolCall.name,
            input: toolCall.args ?? null,
            output: toolCall.result ?? null,
          });
          queue.push(
            emitAndPersist({
              type: "tool_call",
              toolCall: {
                id: toolCall.name,
                name: toolCall.name,
                args: toolCall.args ?? null,
                result: toolCall.result ?? null,
              },
            })
          );
        }

        if (fullText) {
          queue.push(emitAndPersist({ type: "delta", text: fullText }));
        }

        const savedAssistantMessage = await conversations.addMessage(conversationId, {
          role: "assistant",
          content: fullText,
          toolCalls: toolCallsLog.length > 0 ? JSON.stringify(toolCallsLog) : undefined,
        });

        await agentRuns.updateStatus(run.id, "succeeded");
        const conversation = await conversations.getById(conversationId);
        queue.push(
          emitAndPersist({
            type: "run_completed",
            result: {
              text: fullText,
              conversationId,
              userMessage: savedUserMessage,
              assistantMessage: savedAssistantMessage,
              conversation,
            },
          })
        );
        return;
      }

      const stream = await streamChat(
        messages,
        request.mode === "voice" ? "voice" : "text",
        conversationId,
        // Tool event callback: push events to queue immediately
        async (event) => {
          if (event.type === "tool-call") {
            const index = toolCallsLog.length;
            toolCallsLog.push({ name: event.name, input: event.args ?? null, output: null });
            toolCallIndexByCallId.set(event.toolCallId, index);
            queue.push(
              emitAndPersist({
                type: "tool_call",
                toolCall: { id: event.toolCallId, name: event.name, args: event.args },
              })
            );
          } else if (event.type === "tool-result") {
            const index = toolCallIndexByCallId.get(event.toolCallId);
            if (index !== undefined && toolCallsLog[index]) {
              toolCallsLog[index].output = event.result;
            }
            queue.push(
              emitAndPersist({
                type: "tool_call",
                toolCall: { id: event.toolCallId, name: event.name, args: null, result: event.result },
              })
            );
          }
        },
        abortController,
        {
          runId: run.id,
          projectId: context.projectId,
          mode: request.mode,
          onApprovalRequired: (approvalRequestId) => {
            queue.push(
              emitAndPersist({
                type: "run_suspended",
                runId: run.id,
                reason: "approval_required",
                approvalRequestIds: [approvalRequestId],
              })
            );
          },
        } as AIToolRuntimeContext,
        // Memory read callback
        (memoryIds) => queue.push(emitAndPersist({ type: "memory_read", memoryIds }))
      );

      const timeoutMs = configManager.getStreamTimeout();
      const normalized = withStreamTimeout(
        normalizeStream(stream.stream.fullStream),
        timeoutMs
      );

      for await (const event of normalized) {
        if (abortController.signal.aborted) {
          break;
        }
        if (event.type === "delta") {
          fullText += event.text;
          queue.push(emitAndPersist({ type: "delta", text: event.text }));
        }
      }

      if (abortController.signal.aborted) {
        return;
      }

      // Stream finished — save assistant message
      const savedAssistantMessage = await conversations.addMessage(conversationId, {
        role: "assistant",
        content: fullText,
        toolCalls: toolCallsLog.length > 0 ? JSON.stringify(toolCallsLog) : undefined,
        modelUsed: stream?.selectedModel,
      });

      await agentRuns.updateStatus(run.id, "succeeded");

      const conversation = await conversations.getById(conversationId);
      queue.push(
        emitAndPersist({
          type: "run_completed",
          result: {
            text: fullText,
            conversationId,
            userMessage: savedUserMessage,
            assistantMessage: savedAssistantMessage,
            conversation,
          },
        })
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logError("runStreamTurn/stream", err);

      if (fullText) {
        await conversations.addMessage(conversationId, {
          role: "assistant",
          content: fullText,
        });
      }

      const isCancelled = abortController.signal.aborted && !abortedByWatchdog;
      const finalStatus = isCancelled ? "cancelled" : "failed";
      queue.push(emitAndPersist({ type: "run_failed", error: errorMsg }));
      await agentRuns.updateStatus(run.id, finalStatus, errorMsg);
    } finally {
      clearTimeout(watchdogId);
      unregisterActiveRun(run.id);
      queue.close();
    }
  })();

  // Consume queue event stream
  const eventStream = async function* (): AsyncGenerator<AgentRunEvent> {
    yield emitAndPersist({ type: "run_started", runId: run.id, mode: request.mode });
    for await (const event of queue) {
      yield event;
    }
  };

  // Handle client disconnect
  abortController.signal.addEventListener("abort", () => {
    clearTimeout(watchdogId);
    unregisterActiveRun(run.id);

    // Asynchronously update DB status so we don't block the sync abort path
    (async () => {
      try {
        const currentRun = await agentRuns.getById(run.id);
        if (currentRun && (currentRun.status === "running" || currentRun.status === "queued")) {
          const finalStatus = abortedByWatchdog ? "failed" : "cancelled";
          const errorMsg = abortedByWatchdog ? "Watchdog timeout" : "Client disconnected";
          await agentRuns.updateStatus(run.id, finalStatus, errorMsg);
        }
      } catch (err) {
        logError("abortListener/statusUpdate", err);
      } finally {
        queue.close();
      }
    })();
  });

  return {
    runId: run.id,
    conversationId: conversationId!,
    stream: eventStream(),
    abortController,
  };
}

/**
 * AsyncQueue — Decoupled event generator channel.
 */
class AsyncQueue<T> {
  private queue: T[] = [];
  private resolvers: ((value: IteratorResult<T>) => void)[] = [];
  private closed = false;

  push(value: T) {
    if (this.closed) return;
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve({ value, done: false });
    } else {
      this.queue.push(value);
    }
  }

  close() {
    this.closed = true;
    while (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve({ value: undefined as unknown as T, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.queue.length > 0) {
          const value = this.queue.shift()!;
          return Promise.resolve({ value, done: false });
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined as unknown as T, done: true });
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.resolvers.push(resolve);
        });
      }
    };
  }
}
