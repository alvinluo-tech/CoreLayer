/**
 * Run history projection — rebuilds a conversation from run events.
 *
 * The event log is the durable record of what happened; the messages table is
 * a mutable projection (compression rewrites it, titles change). This module
 * proves the direction of dependency: history can be reconstructed from events
 * alone, so a lost or corrupted projection is recoverable and an audit can
 * compare the two.
 */

import type { AgentRunEvent } from "../domain/agent-run.js";
import type { AgentRunEventRow } from "../../../persistence/repository.js";

export interface ProjectedMessage {
  messageId: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: unknown[];
  /** Event sequence this message was recorded at. */
  sequence: number;
}

/**
 * Project ordered run events into the conversation turns they record.
 *
 * Events without a message boundary (tool calls, memory reads, deltas) are
 * intentionally skipped: they explain *how* an answer was produced, not what
 * the conversation contains.
 */
export function projectConversation(
  events: Array<Pick<AgentRunEventRow, "sequence" | "type" | "payload">>,
): ProjectedMessage[] {
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  const messages: ProjectedMessage[] = [];

  for (const row of ordered) {
    const event = row.payload as AgentRunEvent | undefined;
    if (!event || typeof event !== "object") continue;

    if (event.type === "user_message") {
      messages.push({
        messageId: event.messageId,
        role: "user",
        content: event.content,
        sequence: row.sequence,
      });
    } else if (event.type === "assistant_message") {
      messages.push({
        messageId: event.messageId,
        role: "assistant",
        content: event.content,
        toolCalls: event.toolCalls,
        sequence: row.sequence,
      });
    }
  }

  return messages;
}
