/**
 * Stream Helpers — shared SSE event mapping for agent run streams.
 *
 * Eliminates the duplicated delta/tool_call/tool_result/run_completed/
 * run_failed/run_suspended event loop found in conversations.ts, chat.ts,
 * and voice.ts.
 */

import type { SSEStreamingApi } from "hono/streaming";
import type { AgentRunEvent } from "../../runtimes/agent/public-api.js";
import { getRepositories } from "../../persistence/factory.js";
import { logError, extractErrorMessage } from "../../shared/errors.js";

// ---- Types ----

interface StreamWriter {
  write(data: string): Promise<unknown>;
}

interface DonePayload {
  fullText: string;
  conversationId: string;
  runId: string;
  userMessage?: unknown;
  assistantMessage?: unknown;
  conversation?: unknown;
}

interface PipeOptions {
  runId: string;
  conversationId?: string;
  /** Called for each delta event before it is written to the stream. */
  onDelta?: (text: string) => void;
  /** Called before the done event is written. Return extra fields to merge into the done payload. */
  onDoneData?: (data: DonePayload) => Promise<Record<string, unknown> | void>;
}

interface PipeResult {
  fullText: string;
}

// ---- Internal: map a single event to SSE write ----

async function writeEvent(
  event: AgentRunEvent,
  writer: StreamWriter,
  opts: PipeOptions,
  state: { fullText: string },
): Promise<void> {
  switch (event.type) {
    case "delta":
      state.fullText += event.text;
      opts.onDelta?.(event.text);
      await writer.write(
        `event: delta\ndata: ${JSON.stringify({ text: event.text })}\n\n`,
      );
      break;

    case "tool_call": {
      const tc = event.toolCall;
      if (tc.result !== undefined) {
        await writer.write(
          `event: tool_result\ndata: ${JSON.stringify({ name: tc.name, toolCallId: tc.id ?? "", output: tc.result })}\n\n`,
        );
      } else {
        await writer.write(
          `event: tool_calls\ndata: ${JSON.stringify({ name: tc.name, toolCallId: tc.id ?? "", input: tc.args })}\n\n`,
        );
      }
      break;
    }

    case "run_completed": {
      const doneData: DonePayload = {
        fullText: event.result.text,
        conversationId: event.result.conversationId,
        runId: opts.runId,
        userMessage: event.result.userMessage,
        assistantMessage: event.result.assistantMessage,
        conversation: event.result.conversation,
      };
      const extra = await opts.onDoneData?.(doneData);
      await writer.write(
        `event: done\ndata: ${JSON.stringify({ ...doneData, ...extra })}\n\n`,
      );
      break;
    }

    case "run_failed":
      await writer.write(
        `event: error\ndata: ${JSON.stringify({ error: event.error })}\n\n`,
      );
      break;

    case "run_suspended": {
      const { approvalRequests } = getRepositories();
      const approvals = await Promise.all(
        event.approvalRequestIds.map(async (approvalId) => {
          const req = await approvalRequests.getById(approvalId);
          return req
            ? { id: req.id, toolName: req.toolName, args: req.args, risk: req.risk, preview: req.preview }
            : null;
        }),
      );

      await writer.write(
        `event: approval_required\ndata: ${JSON.stringify({
          runId: event.runId,
          conversationId: opts.conversationId ?? "",
          approvals: approvals.filter(Boolean),
        })}\n\n`,
      );
      break;
    }
  }
}

// ---- Public API ----

/**
 * Pipe an agent run stream to a Hono streamSSE writer.
 * Used by conversations.ts and voice.ts.
 */
export async function pipeRunStreamToSSE(
  stream: AsyncIterable<AgentRunEvent>,
  sseStream: SSEStreamingApi,
  opts: PipeOptions,
): Promise<PipeResult> {
  const state = { fullText: "" };

  for await (const event of stream) {
    await writeEvent(event, sseStream, opts, state);
  }

  return { fullText: state.fullText };
}

/**
 * Pipe an agent run stream to a raw stream writer.
 * Used by chat.ts.
 */
export async function pipeRunStreamToWriter(
  stream: AsyncIterable<AgentRunEvent>,
  writer: StreamWriter,
  opts: PipeOptions,
): Promise<PipeResult> {
  const state = { fullText: "" };

  for await (const event of stream) {
    await writeEvent(event, writer, opts, state);
  }

  return { fullText: state.fullText };
}

/**
 * Send an error event to a raw stream writer (for mid-stream error handling).
 */
export async function writeStreamError(
  writer: StreamWriter,
  error: unknown,
  context: string,
): Promise<void> {
  logError(context, error);
  const message = extractErrorMessage(error);
  await writer.write(
    `event: error\ndata: ${JSON.stringify({ error: message })}\n\n`,
  ).catch(() => {});
}
