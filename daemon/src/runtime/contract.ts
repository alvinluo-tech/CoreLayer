/**
 * Runtime Component Contract — shared types between Rust Core and TS runtime.
 *
 * These types mirror the Rust-side RuntimeRegistry types and are used by
 * the /api/runtime/components endpoint and the Control Center UI.
 */

/** Kinds of runtime components that Jarvis can manage. */
export type RuntimeKind =
  | "agent-runtime"
  | "tool-runtime"
  | "coding-runtime"
  | "voice-runtime"
  | "memory-runtime"
  | "scheduler-runtime"
  | "computer-control-runtime";

/** Status of a managed runtime component. */
export type RuntimeStatus =
  | "pending"
  | "starting"
  | "running"
  | "degraded"
  | "stopped"
  | "failed";

/** How a runtime should be restarted on failure. */
export type RestartPolicy =
  | { type: "never" }
  | { type: "maxAttempts"; maxAttempts: number }
  | { type: "always" };

/** Describes a single managed runtime component. */
export interface RuntimeComponent {
  kind: RuntimeKind;
  status: RuntimeStatus;
  pid?: number;
  port?: number;
  healthUrl?: string;
  logPath?: string;
  restartPolicy: RestartPolicy;
  lastHealthCheck?: string;
  lastError?: string;
}

/** All defined runtime kinds. */
export const ALL_RUNTIME_KINDS: RuntimeKind[] = [
  "agent-runtime",
  "tool-runtime",
  "coding-runtime",
  "voice-runtime",
  "memory-runtime",
  "scheduler-runtime",
  "computer-control-runtime",
];
