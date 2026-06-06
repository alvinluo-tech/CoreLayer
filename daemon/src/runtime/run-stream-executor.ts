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
import { resolveRunContext } from "./run-context.js";
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
  const { agentRuns, conversations, agentRunEvents } = getRepositories();

  // Resolve context (workspace, agent defaults)
  const context = await resolveRunContext({
    workspaceId: request.workspaceId,
    projectId: request.projectId,
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

  // Build message history for streamChat
  const history = await conversations.getMessages(conversationId);
  const messages: ModelMessage[] = history.slice(-20).map((msg) => ({
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

  // Internal state
  let fullText = "";
  const toolCallsLog: { name: string; input: unknown; output: unknown }[] = [];
  const toolCallIndexByCallId = new Map<string, number>();

  // Buffer for events from the onToolEvent callback.
  // The callback fires during onStepFinish (inside the SDK's stream iteration),
  // so we can't yield from it. Instead we buffer and yield on the next iteration.
  const eventBuffer: AgentRunEvent[] = [];

  let eventSequence = 0;

  const emitAndPersist = (event: AgentRunEvent) => {
    options?.onEvent?.(event);
    if (event.type !== "delta") {
      const seq = eventSequence++;
      agentRunEvents.create({
        runId: run.id,
        sequence: seq,
        type: event.type,
        payload: event,
      }).catch((err) => logError("agentRunEvents/create", err));
    }
    return event;
  };

  // Build the async iterable that yields AgentRunEvents
  const eventStream = async function* (): AsyncGenerator<AgentRunEvent> {
    yield emitAndPersist({ type: "run_started", runId: run.id, mode: request.mode });

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
              emitAndPersist({
                type: "tool_call",
                toolCall: { id: event.toolCallId, name: event.name, args: event.args },
              }),
            );
          } else if (event.type === "tool-result") {
            const index = toolCallIndexByCallId.get(event.toolCallId);
            if (index !== undefined && toolCallsLog[index]) {
              toolCallsLog[index].output = event.result;
            }
            eventBuffer.push(
              emitAndPersist({
                type: "tool_call",
                toolCall: { id: event.toolCallId, name: event.name, args: null, result: event.result },
              }),
            );
          }
        },
        abortController,
        {
          runId: run.id,
          projectId: request.projectId,
          mode: request.mode,
        },
      );
    } catch (err) {
      clearTimeout(watchdogId);
      const errorMsg = err instanceof Error ? err.message : String(err);
      logError("runStreamTurn/streamChat", err);
      const isCancelled = abortController.signal.aborted && !abortedByWatchdog;
      const finalStatus = isCancelled ? "cancelled" : "failed";
      const failEvent = emitAndPersist({ type: "run_failed", error: errorMsg });
      yield failEvent;
      await agentRuns.updateStatus(run.id, finalStatus, errorMsg);
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
          yield emitAndPersist({ type: "delta", text: event.text });
        }
        // thinking, tool_calls, tool_result from normalizeStream are handled
        // by the onToolEvent callback above; no need to duplicate here
      }

      // Drain any remaining buffered events
      while (eventBuffer.length > 0) {
        yield eventBuffer.shift()!;
      }

      // Stream finished — save assistant message
      const savedAssistantMessage = await conversations.addMessage(conversationId, {
        role: "assistant",
        content: fullText,
        toolCalls: toolCallsLog.length > 0 ? JSON.stringify(toolCallsLog) : undefined,
      });

      await agentRuns.updateStatus(run.id, "succeeded");

      const conversation = await conversations.getById(conversationId);
      yield emitAndPersist({
        type: "run_completed",
        result: { text: fullText, conversationId, userMessage: savedUserMessage, assistantMessage: savedAssistantMessage, conversation },
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

      const isCancelled = abortController.signal.aborted && !abortedByWatchdog;
      const finalStatus = isCancelled ? "cancelled" : "failed";
      yield emitAndPersist({ type: "run_failed", error: errorMsg });
      await agentRuns.updateStatus(run.id, finalStatus, errorMsg);
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
