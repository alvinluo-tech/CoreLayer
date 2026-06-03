/**
 * SSE event normalizer.
 * Maps AI SDK fullStream TextStreamPart types to a unified SSE event protocol.
 *
 * Event protocol:
 *   delta      — text chunk         { text: string }
 *   thinking   — reasoning token    { text: string }
 *   tool_calls — tool invocation    { name, toolCallId, input }
 *   tool_result— tool output        { name, toolCallId, output }
 *   error      — stream error       { error: string }
 *   done       — termination        (payload set by route handler)
 */

// ---- Event types ----

export interface SSEDeltaEvent {
  type: "delta";
  text: string;
}

export interface SSEThinkingEvent {
  type: "thinking";
  text: string;
}

export interface SSEToolCallsEvent {
  type: "tool_calls";
  name: string;
  toolCallId: string;
  input: unknown;
}

export interface SSEToolResultEvent {
  type: "tool_result";
  name: string;
  toolCallId: string;
  output: unknown;
}

export interface SSEErrorEvent {
  type: "error";
  error: string;
}

export interface SSEDoneEvent {
  type: "done";
  [key: string]: unknown;
}

export type SSENormalizedEvent =
  | SSEDeltaEvent
  | SSEThinkingEvent
  | SSEToolCallsEvent
  | SSEToolResultEvent
  | SSEErrorEvent
  | SSEDoneEvent;

// ---- Stream part shape (minimal — avoids importing AI SDK generics) ----

interface StreamPart {
  type: string;
  text?: string;
  delta?: string;
  toolName?: string;
  toolCallId?: string;
  args?: unknown;
  input?: unknown;
  result?: unknown;
  output?: unknown;
  error?: unknown;
}

// ---- Normalizer ----

/**
 * Async generator that reads an AI SDK fullStream and yields normalized
 * SSE events. Only emits delta, thinking, tool_calls, and tool_result.
 * The route handler is responsible for emitting done and error events.
 */
export async function* normalizeStream(
  source: AsyncIterable<StreamPart>,
): AsyncGenerator<SSENormalizedEvent> {
  for await (const part of source) {
    switch (part.type) {
      case "text-delta":
        if (part.text) {
          yield { type: "delta", text: part.text };
        }
        break;

      case "reasoning-delta":
        if (part.text) {
          yield { type: "thinking", text: part.text };
        }
        break;

      case "tool-call":
        yield {
          type: "tool_calls",
          name: part.toolName ?? "unknown",
          toolCallId: part.toolCallId ?? "",
          input: part.input ?? part.args ?? null,
        };
        break;

      case "tool-result":
        yield {
          type: "tool_result",
          name: part.toolName ?? "unknown",
          toolCallId: part.toolCallId ?? "",
          output: part.output ?? part.result ?? null,
        };
        break;

      // Skip non-actionable part types:
      // text-start, text-end, reasoning-start, reasoning-end,
      // tool-input-start, tool-input-delta, tool-input-end,
      // start-step, finish-step, start, finish, abort, source, file,
      // tool-error, tool-output-denied
      default:
        break;
    }
  }
}
