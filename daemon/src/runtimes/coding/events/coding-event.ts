/**
 * Unified Coding Runtime Events.
 *
 * All adapters (Claude Code, Codex, OpenCode) normalize their output
 * into these canonical event types. The frontend only consumes these.
 */

/** Canonical event types emitted by coding adapters */
export type CodingRunEventType =
  | "run_started"
  | "agent_message"
  | "tool_call"
  | "tool_result"
  | "file_read"
  | "file_written"
  | "shell_command"
  | "approval_requested"
  | "artifact_created"
  | "run_completed"
  | "run_failed"
  | "run_cancelled";

/** Individual event payloads — discriminated union by `type` */
export type CodingRunEvent =
  | { type: "run_started"; runId: string }
  | { type: "agent_message"; text: string }
  | { type: "tool_call"; toolName: string; input: unknown }
  | { type: "tool_result"; toolName: string; result: unknown }
  | { type: "file_read"; path: string }
  | { type: "file_written"; path: string; diff?: string }
  | { type: "shell_command"; command: string }
  | { type: "approval_requested"; risk: string; reason: string }
  | { type: "artifact_created"; artifactId: string }
  | { type: "run_completed"; summary: string }
  | { type: "run_failed"; error: string }
  | { type: "run_cancelled"; reason?: string };

/** Normalized event with metadata — what the frontend and DB receive */
export interface NormalizedEvent {
  runId: string;
  sequence: number;
  event: CodingRunEvent;
  createdAt: string;
}

/** Adapter-specific raw event types (before normalization) */
export interface AdapterRawEvent {
  type: string;
  payload: unknown;
}
