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
} from "./agent-run.js";
import { getRepositories } from "../db/factory.js";
import { streamChat } from "../orchestrator/conversation.js";
import { normalizeStream } from "../api/sse-normalizer.js";
import { withStreamTimeout } from "../api/stream-timeout.js";
import { configManager } from "../config/config-manager.js";
import { logError } from "../utils/errors.js";
import type { ModelMessage } from "ai";

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
  const { agentRuns, conversations } = getRepositories();

  const abortController = options?.abortController ?? new AbortController();

  // Watchdog: abort if turn takes too long
  const watchdogId = setTimeout(() => {
    logError("[StreamTurn] watchdog timeout", new Error(`${WATCHDOG_MS}ms exceeded`));
    abortController.abort();
  }, WATCHDOG_MS);

  // Resolve or create conversation
  let conversationId = request.conversationId;
  if (!conversationId) {
    const conv = await conversations.create(
      request.mode === "voice" ? "Voice Chat" : "New Chat",
    );
    conversationId = conv.id;
  }

  // Save user message
  await conversations.addMessage(conversationId, {
    role: "user",
    content: request.input,
  });

  // Build message history for streamChat
  const history = await conversations.getMessages(conversationId);
  const messages: ModelMessage[] = history.slice(-20).map((msg) => ({
    role: msg.role as "user" | "assistant",
    content: msg.content,
  }));

  // Create AgentRun
  const run = await agentRuns.create({
    conversationId,
    workspaceId: request.workspaceId,
    projectId: request.projectId,
    taskId: request.taskId,
    agentId: request.agentId,
    mode: request.mode,
    selectedModel: request.modelOverride ?? undefined,
  });

  // Internal state
  let fullText = "";
  const toolCallsLog: { name: string; input: unknown; output: unknown }[] = [];
  const toolCallIndexByCallId = new Map<string, number>();

  // Buffer for events from the onToolEvent callback.
  // The callback fires during onStepFinish (inside the SDK's stream iteration),
  // so we can't yield from it. Instead we buffer and yield on the next iteration.
  const eventBuffer: AgentRunEvent[] = [];

  const emit = (event: AgentRunEvent) => {
    options?.onEvent?.(event);
    return event;
  };

  // Build the async iterable that yields AgentRunEvents
  const eventStream = async function* (): AsyncGenerator<AgentRunEvent> {
    yield emit({ type: "run_started", runId: run.id, mode: request.mode });

    let stream: Awaited<ReturnType<typeof streamChat>>;
    try {
      stream = await streamChat(
        messages,
        request.mode === "voice" ? "voice" : "text",
        conversationId,
        // Tool event callback: buffer events for later yielding
        async (event) => {
          if (event.type === "tool-call") {
            const index = toolCallsLog.length;
            toolCallsLog.push({ name: event.name, input: event.args ?? null, output: null });
            toolCallIndexByCallId.set(event.toolCallId, index);
            eventBuffer.push(
              emit({
                type: "tool_call",
                toolCall: { name: event.name, args: event.args },
              }),
            );
          } else if (event.type === "tool-result") {
            const index = toolCallIndexByCallId.get(event.toolCallId);
            if (index !== undefined && toolCallsLog[index]) {
              toolCallsLog[index].output = event.result;
            }
            eventBuffer.push(
              emit({
                type: "tool_call",
                toolCall: { name: event.name, args: null, result: event.result },
              }),
            );
          }
        },
        abortController,
      );
    } catch (err) {
      clearTimeout(watchdogId);
      const errorMsg = err instanceof Error ? err.message : String(err);
      logError("runStreamTurn/streamChat", err);
      yield emit({ type: "run_failed", error: errorMsg });
      await agentRuns.updateStatus(run.id, "failed", errorMsg);
      return;
    }

    // Consume the normalized stream
    const timeoutMs = configManager.getStreamTimeout();
    const normalized = withStreamTimeout(
      normalizeStream(stream.stream.fullStream),
      timeoutMs,
    );

    try {
      for await (const event of normalized) {
        // Yield any buffered tool events first
        while (eventBuffer.length > 0) {
          yield eventBuffer.shift()!;
        }

        if (event.type === "delta") {
          fullText += event.text;
          yield emit({ type: "delta", text: event.text });
        }
        // thinking, tool_calls, tool_result from normalizeStream are handled
        // by the onToolEvent callback above; no need to duplicate here
      }

      // Drain any remaining buffered events
      while (eventBuffer.length > 0) {
        yield eventBuffer.shift()!;
      }

      // Stream finished — save assistant message
      await conversations.addMessage(conversationId, {
        role: "assistant",
        content: fullText,
        toolCalls: toolCallsLog.length > 0 ? JSON.stringify(toolCallsLog) : undefined,
      });

      await agentRuns.updateStatus(run.id, "succeeded");

      yield emit({
        type: "run_completed",
        result: { text: fullText, conversationId },
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logError("runStreamTurn/stream", err);

      // Save partial assistant message if we have any text
      if (fullText) {
        await conversations.addMessage(conversationId, {
          role: "assistant",
          content: fullText,
        });
      }

      yield emit({ type: "run_failed", error: errorMsg });
      await agentRuns.updateStatus(run.id, "failed", errorMsg);
    } finally {
      clearTimeout(watchdogId);
    }
  };

  // Handle client disconnect
  abortController.signal.addEventListener("abort", () => {
    clearTimeout(watchdogId);
  });

  return {
    runId: run.id,
    conversationId,
    stream: eventStream(),
    abortController,
  };
}
