/**
 * Coding Runtime types.
 *
 * Defines the contract for integrating external coding tools (Claude Code,
 * Codex, OpenCode) as controlled Jarvis tool runtimes.
 *
 * All adapters implement `CodingAgentAdapter` and emit `NormalizedEvent`
 * from the events module. The frontend consumes only those canonical types.
 */

import type { NormalizedEvent } from "./events/coding-event.js";

/** Status of a coding run */
export type CodingRunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

/** Input for creating a coding run */
export interface CodingTask {
  /** Optional DB run ID — adapters should use this instead of generating their own */
  dbRunId?: string;
  /** Optional DB task ID for workspace event context */
  dbTaskId?: string;
  /** Workspace ID for event context */
  workspaceId?: string;
  /** Project ID for event context */
  projectId?: string;
  /** Conversation ID for session file tracking */
  conversationId?: string;
  /** Repository path (absolute) */
  repoPath: string;
  /** Worktree path for isolated execution (optional, auto-created if not provided) */
  worktreePath?: string;
  /** Branch name to work on */
  branchName?: string;
  /** The task prompt for the coding agent */
  taskPrompt: string;
  /** Allowed file paths the agent can modify (glob patterns) */
  allowedPaths?: string[];
  /** Test commands to run after changes */
  testCommands?: string[];
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Permission policy override */
  permissionPolicy?: "strict" | "normal" | "permissive";
}

/** Artifact produced by a coding run */
export interface CodingArtifact {
  type: "diff_summary" | "changed_files" | "test_report" | "final_summary" | "log_path" | "error";
  content: string;
  metadata?: Record<string, unknown>;
}

/** Adapter availability after discovery */
export interface AdapterAvailability {
  available: boolean;
  version?: string;
  reason?: string;
  transport: "sdk" | "cli";
}

/** Handle returned when a run is started */
export interface CodingRunHandle {
  runId: string;
  adapterId: string;
  status: CodingRunStatus;
  pid?: number;
  startedAt: string;
}

/** Status of a coding run (full info) */
export interface CodingRunInfo {
  runId: string;
  adapterId: string;
  status: CodingRunStatus;
  task: CodingTask;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  artifacts: CodingArtifact[];
  error?: string;
}

/**
 * CodingAgentAdapter — the core contract implemented by each coding tool adapter.
 *
 * Each adapter (Claude Code, Codex, OpenCode) implements this interface.
 * Adapters are registered in the adapter registry and selected by the
 * Agent Broker based on the agent profile's executor policy.
 */
export interface CodingAgentAdapter {
  /** Unique adapter identifier */
  readonly id: "claude-code" | "codex" | "opencode";
  /** Human-readable name */
  readonly displayName: string;
  /** @deprecated Use displayName instead */
  readonly name: string;

  /** Check if this adapter's CLI/SDK is available on this machine */
  discover(): Promise<AdapterAvailability>;

  /** Create and start a coding run (returns lightweight handle) */
  startRun(task: CodingTask): Promise<CodingRunHandle>;

  /** @deprecated Use startRun() instead. Returns full CodingRunInfo. */
  createRun(task: CodingTask): Promise<CodingRunInfo>;

  /** Get the current status of a run */
  getRunStatus(runId: string): Promise<CodingRunInfo>;

  /** Stream normalized events from a run */
  streamRunEvents(runId: string): AsyncIterable<NormalizedEvent>;

  /** Cancel a running task */
  cancelRun(runId: string): Promise<boolean>;

  /** Collect artifacts from a completed run */
  collectArtifacts(runId: string): Promise<CodingArtifact[]>;
}

/**
 * @deprecated Use `CodingAgentAdapter` instead. Kept for backward compatibility.
 */
export type CodingRuntime = CodingAgentAdapter;
