/**
 * Executor Lifecycle Types
 *
 * Shared vocabulary for managed executors (Claude Code, Codex, OpenCode, future cloud agents).
 * These types define the unified contract that all executor adapters must implement.
 */

// ─── Executor Statuses ───────────────────────────────────────────────────────

/** Normalized executor run status */
export type ExecutorStatus =
  | 'created'
  | 'queued'
  | 'preparing_workspace'
  | 'waiting_for_permission'
  | 'starting_executor'
  | 'running'
  | 'waiting_for_executor_input'
  | 'collecting_artifacts'
  | 'verifying'
  | 'needs_retry'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'cleanup_failed';

// ─── Executor Events ─────────────────────────────────────────────────────────

/** Normalized executor event types */
export type ExecutorEventType =
  | 'executor.discovered'
  | 'executor.prepared'
  | 'executor.started'
  | 'executor.stdout'
  | 'executor.stderr'
  | 'executor.permission_blocked'
  | 'executor.file_changed'
  | 'executor.test_result'
  | 'executor.completed'
  | 'executor.failed'
  | 'executor.cancelled'
  | 'executor.timed_out'
  | 'executor.cleaned';

/** Base executor event */
export interface ExecutorEvent {
  type: ExecutorEventType;
  runId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutorDiscoveredEvent extends ExecutorEvent {
  type: 'executor.discovered';
  metadata: {
    adapterId: string;
    version?: string;
    available: boolean;
    reason?: string;
  };
}

export interface ExecutorPreparedEvent extends ExecutorEvent {
  type: 'executor.prepared';
  metadata: {
    adapterId: string;
    workspacePath: string;
    worktreePath?: string;
  };
}

export interface ExecutorStartedEvent extends ExecutorEvent {
  type: 'executor.started';
  metadata: {
    adapterId: string;
    pid?: number;
    command?: string;
  };
}

export interface ExecutorStdoutEvent extends ExecutorEvent {
  type: 'executor.stdout';
  metadata: {
    line: string;
    lineNumber: number;
  };
}

export interface ExecutorStderrEvent extends ExecutorEvent {
  type: 'executor.stderr';
  metadata: {
    line: string;
    lineNumber: number;
  };
}

export interface ExecutorPermissionBlockedEvent extends ExecutorEvent {
  type: 'executor.permission_blocked';
  metadata: {
    permissionType: string;
    resource?: string;
    rawOutput?: string;
  };
}

export interface ExecutorFileChangedEvent extends ExecutorEvent {
  type: 'executor.file_changed';
  metadata: {
    path: string;
    changeType: 'created' | 'modified' | 'deleted';
  };
}

export interface ExecutorTestResultEvent extends ExecutorEvent {
  type: 'executor.test_result';
  metadata: {
    command: string;
    exitCode: number;
    stdout?: string;
    stderr?: string;
    passed: boolean;
  };
}

export interface ExecutorCompletedEvent extends ExecutorEvent {
  type: 'executor.completed';
  metadata: {
    exitCode: number;
    durationMs: number;
    artifactCount: number;
  };
}

export interface ExecutorFailedEvent extends ExecutorEvent {
  type: 'executor.failed';
  metadata: {
    error: string;
    exitCode?: number;
    durationMs: number;
    failureCategory?: ExecutorFailureCategory;
  };
}

export interface ExecutorCancelledEvent extends ExecutorEvent {
  type: 'executor.cancelled';
  metadata: {
    reason: string;
    durationMs: number;
  };
}

export interface ExecutorTimedOutEvent extends ExecutorEvent {
  type: 'executor.timed_out';
  metadata: {
    timeoutMs: number;
    durationMs: number;
  };
}

export interface ExecutorCleanedEvent extends ExecutorEvent {
  type: 'executor.cleaned';
  metadata: {
    worktreeRemoved: boolean;
    cleanupSuccess: boolean;
  };
}

/** Union of all executor events */
export type AnyExecutorEvent =
  | ExecutorDiscoveredEvent
  | ExecutorPreparedEvent
  | ExecutorStartedEvent
  | ExecutorStdoutEvent
  | ExecutorStderrEvent
  | ExecutorPermissionBlockedEvent
  | ExecutorFileChangedEvent
  | ExecutorTestResultEvent
  | ExecutorCompletedEvent
  | ExecutorFailedEvent
  | ExecutorCancelledEvent
  | ExecutorTimedOutEvent
  | ExecutorCleanedEvent;

// ─── Failure Categories ──────────────────────────────────────────────────────

export type ExecutorFailureCategory =
  | 'transient_provider_error'
  | 'executor_not_available'
  | 'permission_denied'
  | 'permission_blocked'
  | 'timeout'
  | 'test_failed'
  | 'verification_failed'
  | 'sandbox_policy_violation'
  | 'artifact_missing'
  | 'user_cancelled'
  | 'unknown';

// ─── Capability Profile ──────────────────────────────────────────────────────

/** Capabilities reported by an executor adapter */
export interface ExecutorCapabilityProfile {
  /** Executor adapter ID */
  adapterId: string;

  /** Supports non-interactive/headless execution */
  nonInteractive: boolean;
  /** Supports streaming events from stdout/stderr */
  streamEvents: boolean;
  /** Supports structured JSON output */
  jsonOutput: boolean;
  /** Supports permission mode configuration */
  permissionMode: boolean;
  /** Supports MCP config injection */
  mcpConfig: boolean;
  /** Supports isolated HOME/config directory */
  isolatedHome: boolean;
  /** Supports cancellation via signal */
  cancellation: boolean;
  /** Supports resumable sessions */
  resumableSession: boolean;

  /** Supported backend kinds */
  supportedBackends: Array<'local' | 'worktree' | 'docker' | 'ssh' | 'cloud'>;

  /** Default timeout in milliseconds */
  defaultTimeoutMs: number;

  /** Known CLI flags or SDK options */
  knownFlags?: string[];
}

// ─── Request / Result Types ──────────────────────────────────────────────────

/** Request to prepare an executor run */
export interface ExecutorRunRequest {
  runId: string;
  taskId?: string;
  workspaceId?: string;
  projectId?: string;
  agentId: string;
  adapterId: string;

  taskPrompt: string;
  repoPath: string;
  worktreePath?: string;
  branchName?: string;

  allowedPaths?: string[];
  testCommands?: string[];
  timeoutMs?: number;
  permissionPolicy?: 'strict' | 'normal' | 'permissive';
}

/** Handle returned when an executor run is started */
export interface ExecutorHandle {
  runId: string;
  adapterId: string;
  status: ExecutorStatus;
  pid?: number;
  startedAt: string;
}

/** Artifacts collected from a completed executor run */
export interface ExecutorArtifacts {
  runId: string;
  diff?: string;
  changedFiles: string[];
  testResults: Array<{
    command: string;
    exitCode: number;
    passed: boolean;
    stdout?: string;
    stderr?: string;
  }>;
  finalSummary?: string;
  logPath?: string;
  additional: Array<{
    type: string;
    content: string;
    metadata?: Record<string, unknown>;
  }>;
}

// ─── Executor Adapter Interface ──────────────────────────────────────────────

/**
 * Unified executor adapter contract.
 *
 * All coding executors (Claude Code, Codex, OpenCode, future cloud agents)
 * implement this interface. The runtime uses this contract for lifecycle
 * management, sandbox integration, and artifact collection.
 */
export interface ExecutorAdapter {
  /** Unique adapter identifier */
  readonly id: string;
  /** Human-readable display name */
  readonly displayName: string;

  /** Check if this executor is available on this machine */
  discover(): Promise<{
    available: boolean;
    version?: string;
    reason?: string;
    transport: 'sdk' | 'cli';
  }>;

  /** Return the capability profile for this executor */
  getCapabilities(): ExecutorCapabilityProfile;

  /** Prepare a run (validate inputs, set up workspace references) */
  prepare(request: ExecutorRunRequest): Promise<ExecutorHandle>;

  /** Start the executor process */
  start(handle: ExecutorHandle): Promise<ExecutorHandle>;

  /** Stream normalized events from a running executor */
  streamEvents(runId: string): AsyncIterable<ExecutorEvent>;

  /** Get current status of a run */
  getStatus(runId: string): Promise<{
    status: ExecutorStatus;
    error?: string;
    durationMs?: number;
  }>;

  /** Request cancellation of a running executor */
  requestCancel(runId: string): Promise<void>;

  /** Collect artifacts from a completed run */
  collectArtifacts(runId: string): Promise<ExecutorArtifacts>;

  /** Clean up resources (worktree, temp files, etc.) */
  cleanup(runId: string): Promise<void>;
}
