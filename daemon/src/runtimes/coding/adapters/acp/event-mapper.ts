/**
 * Map ACP `session/update` notifications onto Jarvis coding events.
 *
 * Only the stable ACP v1 surface is consumed here. ACP v2 removes `fs/*` and
 * `terminal/*`, so nothing in this mapper depends on those methods being
 * available; they only appear as already-materialised tool calls.
 */

import type { CodingRunEvent } from "../../events/coding-event.js";

/** Tool call ids that have been opened but not yet closed. */
export interface ToolCallTracker {
  open: Map<string, ToolCallRecord>;
}

export interface ToolCallRecord {
  toolName: string;
  /** Last non-null title, used as the fallback display name. */
  title?: string;
  kind?: string;
  rawInput?: unknown;
}

export function createToolCallTracker(): ToolCallTracker {
  return { open: new Map() };
}

/** Shape of the `update` object on an ACP `session/update` notification. */
export interface AcpSessionUpdate {
  sessionUpdate?: string;
  content?: { type?: string; text?: string; [key: string]: unknown };
  toolCallId?: string;
  kind?: string;
  title?: string;
  status?: string;
  rawInput?: unknown;
  rawOutput?: unknown;
  entries?: unknown;
  [key: string]: unknown;
}

export interface AcpUpdateMapping {
  events: CodingRunEvent[];
  /** Text carried by an `agent_message` event, when the update produced one. */
  agentText?: string;
  /**
   * Set when the update closes a tool call. Callers persist this as the
   * artifact anchor for the turn.
   */
  closedToolCall?: { toolCallId: string; toolName: string; status: string };
}

/**
 * Translate one `session/update` payload into zero or more coding events.
 *
 * ACP reports a tool call once with `tool_call` and then again with
 * `tool_call_update` for every status change. Both carry the same
 * `toolCallId`, so the tracker is the only way to recover the tool name on
 * completion.
 */
export function mapAcpUpdate(
  update: AcpSessionUpdate,
  tracker: ToolCallTracker,
): AcpUpdateMapping {
  const events: CodingRunEvent[] = [];
  const kind = update.sessionUpdate;

  switch (kind) {
    case "agent_message_chunk":
    case "user_message_chunk": {
      const text = update.content?.type === "text" ? update.content.text : undefined;
      if (typeof text === "string" && text.length > 0) {
        events.push({ type: "agent_message", text });
        return { events, agentText: text };
      }
      return { events };
    }

    case "agent_thought_chunk":
      // Reasoning is not a user-facing message; surfacing it as agent text
      // would interleave model scratchpad with the run transcript.
      return { events };

    case "tool_call": {
      const toolCallId = update.toolCallId ?? "";
      const existing = tracker.open.get(toolCallId);
      const toolName = resolveToolName(update, tracker);
      // ACP often opens a call with a placeholder title ("Preparing file…")
      // and refines it later. Re-announcing the same id would render duplicate
      // tool cards, so only the first sighting is a `tool_call`.
      tracker.open.set(toolCallId, {
        toolName,
        title: update.title,
        kind: update.kind,
        rawInput: update.rawInput,
      });
      if (existing) return { events };
      events.push({ type: "tool_call", toolName, input: update.rawInput ?? null });
      return { events };
    }

    case "tool_call_update": {
      const toolCallId = update.toolCallId ?? "";
      const known = tracker.open.get(toolCallId);
      const toolName = known?.toolName ?? resolveToolName(update, tracker);
      const status = typeof update.status === "string" ? update.status : "";

      if (status === "completed" || status === "failed" || status === "cancelled") {
        tracker.open.delete(toolCallId);
        const displayName = finalToolName(toolName, update.kind ?? known?.kind);
        events.push({
          type: "tool_result",
          toolName: displayName,
          result: {
            status,
            output: update.rawOutput ?? update.content ?? null,
          },
        });
        return { events, closedToolCall: { toolCallId, toolName: displayName, status } };
      }

      // ACP opens some calls with a placeholder title ("Preparing file…") and
      // only refines it in later updates. Adopt the refined name so the result
      // event carries the real operation, but do not announce a second card.
      if (known && typeof update.title === "string" && update.title.trim() && update.title !== known.title) {
        // Concrete input (a path, a command) beats the model-authored title.
        const refinedName = known.rawInput
          ? resolveToolName({ ...update, rawInput: known.rawInput }, tracker)
          : update.title.trim();
        tracker.open.set(toolCallId, { ...known, title: update.title, toolName: refinedName });
      }
      return { events };
    }

    case "plan": {
      const summary = summarizePlan(update.entries);
      if (summary) events.push({ type: "agent_message", text: summary });
      return { events };
    }

    case "current_mode_update":
    case "config_option_update":
    case "available_commands_update":
    case "usage_update":
    case "session_info_update":
      return { events };

    default:
      return { events };
  }
}

function resolveToolName(update: AcpSessionUpdate, tracker: ToolCallTracker): string {
  const known = update.toolCallId ? tracker.open.get(update.toolCallId) : undefined;
  if (known) return known.toolName;

  const raw = update.rawInput;
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    for (const key of ["tool", "toolName", "name", "command"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    const filePath = record["file_path"] ?? record["path"];
    if (typeof filePath === "string") {
      const action = typeof update.kind === "string" ? update.kind : "tool";
      return `${action}:${filePath}`;
    }
  }

  if (typeof update.title === "string" && update.title.trim()) return update.title.trim();
  if (typeof update.kind === "string" && update.kind.trim()) return update.kind.trim();
  return "unknown";
}

/**
 * ACP sometimes reports a tool call under a progress placeholder ("Preparing
 * file…") and never refines it. Such a name tells the user nothing, so the
 * declared kind is used instead when the call closes.
 */
const PLACEHOLDER_TITLE = /^(preparing|starting|running|working|processing)\b.*(…|\.\.\.)$/i;

function finalToolName(toolName: string, kind: string | undefined): string {
  if (!PLACEHOLDER_TITLE.test(toolName)) return toolName;
  const normalized = kind?.trim();
  return normalized && normalized !== "other" ? normalized : "tool";
}

function summarizePlan(entries: unknown): string | undefined {  if (!Array.isArray(entries) || entries.length === 0) return undefined;
  const lines: string[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const content = typeof record.content === "string" ? record.content : undefined;
    const status = typeof record.status === "string" ? record.status : undefined;
    if (content) lines.push(status ? `- [${status}] ${content}` : `- ${content}`);
  }
  return lines.length > 0 ? `Plan:\n${lines.join("\n")}` : undefined;
}

/**
 * ACP reports `tool_call` without a terminal status for tools the agent runs
 * without asking (for example commands auto-approved by the harness). Those
 * calls stay open forever unless the turn end closes them, which would leave
 * the UI showing a permanently running tool.
 */
export function flushOpenToolCalls(tracker: ToolCallTracker): CodingRunEvent[] {
  const events: CodingRunEvent[] = [];
  for (const [toolCallId, record] of tracker.open) {
    events.push({
      type: "tool_result",
      toolName: record.toolName,
      result: { status: "cancelled", reason: "turn ended before the tool reported completion", toolCallId },
    });
  }
  tracker.open.clear();
  return events;
}
