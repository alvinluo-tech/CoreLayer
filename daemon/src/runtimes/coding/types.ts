/**
 * Coding Runtime types.
 *
 * Defines the contract for integrating external coding tools (Claude Code,
 * Codex, CloudCode) as controlled Jarvis tool runtimes.
 */

/** Status of a coding run */
export type CodingRunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

/** Input for creating a coding run */
export interface CodingTask {
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

/** Internal event queue for streaming events from a run */
export interface CodingRunInfoEvents {
  events: CodingRunEvent[];
  resolve: () => void;
}

/** Status of a coding run */
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

/** Events emitted during a coding run */
export interface CodingRunEvent {
  runId: string;
  sequence: number;
  type: "status_change" | "output" | "artifact" | "error" | "approval_required"
    | "process_spawned" | "stdout" | "stderr" | "process_exited" | "run_cancelled";
  payload: unknown;
  createdAt: string;
}

/**
 * CodingRuntime contract — implemented by each coding tool adapter.
 */
export interface CodingRuntime {
  /** Unique adapter identifier */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;

  /** Create and start a coding run */
  createRun(task: CodingTask): Promise<CodingRunInfo>;

  /** Get the current status of a run */
  getRunStatus(runId: string): Promise<CodingRunInfo>;

  /** Stream events from a run (returns async iterable) */
  streamRunEvents(runId: string): AsyncIterable<CodingRunEvent>;

  /** Cancel a running task */
  cancelRun(runId: string): Promise<boolean>;

  /** Collect artifacts from a completed run */
  collectArtifacts(runId: string): Promise<CodingArtifact[]>;
}
