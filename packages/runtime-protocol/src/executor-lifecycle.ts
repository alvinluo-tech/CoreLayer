/**
 * Executor Lifecycle Types
 *
 * Domain-agnostic vocabulary for managed executors.
 * These types define the unified contract that all executor adapters must implement,
 * regardless of domain (coding, research, image generation, messaging, etc.).
 *
 * Coding-specific details (git, worktree, diff, lint, test) belong in
 * coding-domain packages and adapters, not here.
 */

// ─── Executor Statuses ───────────────────────────────────────────────────────

/** Normalized executor run status */
export type ExecutorStatus =
  | 'created'
  | 'queued'
  | 'preparing_environment'
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
  | 'executor.output'
  | 'executor.error_output'
  | 'executor.permission_blocked'
  | 'executor.artifact_produced'
  | 'executor.verification_result'
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
    environmentKind: string;
  };
}

export interface ExecutorStartedEvent extends ExecutorEvent {
  type: 'executor.started';
  metadata: {
    adapterId: string;
    pid?: number;
  };
}

export interface ExecutorOutputEvent extends ExecutorEvent {
  type: 'executor.output';
  metadata: {
    line: string;
    lineNumber: number;
    stream: 'stdout' | 'stderr';
  };
}

export interface ExecutorErrorOutputEvent extends ExecutorEvent {
  type: 'executor.error_output';
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

export interface ExecutorArtifactProducedEvent extends ExecutorEvent {
  type: 'executor.artifact_produced';
  metadata: {
    artifactType: string;
    artifactId?: string;
    path?: string;
    summary?: string;
  };
}

export interface ExecutorVerificationResultEvent extends ExecutorEvent {
  type: 'executor.verification_result';
  metadata: {
    checkName: string;
    passed: boolean;
    details?: string;
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
    environmentDisposed: boolean;
    cleanupSuccess: boolean;
  };
}

/** Union of all executor events */
export type AnyExecutorEvent =
  | ExecutorDiscoveredEvent
  | ExecutorPreparedEvent
  | ExecutorStartedEvent
  | ExecutorOutputEvent
  | ExecutorErrorOutputEvent
  | ExecutorPermissionBlockedEvent
  | ExecutorArtifactProducedEvent
  | ExecutorVerificationResultEvent
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
  | 'output_quality_failed'
  | 'verification_failed'
  | 'policy_violation'
  | 'artifact_missing'
  | 'user_cancelled'
  | 'unknown';

// ─── Capability Profile ──────────────────────────────────────────────────────

/** Capabilities reported by an executor adapter */
export interface ExecutorCapabilityProfile {
  /** Executor adapter ID */
  adapterId: string;

  /** Domain this executor operates in (coding, research, image-generation, messaging, etc.) */
  domain: string;

  /** Supports non-interactive/headless execution */
  nonInteractive: boolean;
  /** Supports streaming events */
  streamEvents: boolean;
  /** Supports structured output (JSON, etc.) */
  structuredOutput: boolean;
  /** Supports permission mode configuration */
  permissionMode: boolean;
  /** Supports tool/config injection */
  toolConfigInjection: boolean;
  /** Supports isolated environment (HOME, config, tmp) */
  isolatedEnvironment: boolean;
  /** Supports cancellation */
  cancellation: boolean;
  /** Supports resumable sessions */
  resumableSession: boolean;

  /** How permission prompts are projected to Jarvis */
  permissionProjection: 'native' | 'stdout-pattern' | 'unsupported';

  /** How to resume after approval */
  approvalResumeStrategy: 'native_session_resume' | 'prompted_reentry' | 'manual_block';

  /** Default timeout in milliseconds */
  defaultTimeoutMs: number;

  /** Domain-specific capability metadata */
  metadata?: Record<string, unknown>;
}

// ─── Environment ─────────────────────────────────────────────────────────────

/**
 * Generic execution environment descriptor.
 *
 * Coding example: { kind: 'git-worktree', workingDirectory: '/repo', branch: 'feat/x' }
 * Research example: { kind: 'browser-session', startUrl: 'https://...' }
 * Image gen example: { kind: 'canvas', dimensions: { width: 1024, height: 768 } }
 */
export interface ExecutionEnvironment {
  /** Environment kind identifier */
  readonly kind: string;
  /** Working directory or primary context path */
  workingDirectory?: string;
  /** Domain-specific environment configuration */
  metadata?: Record<string, unknown>;
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

  /** The task prompt or instruction for the executor */
  taskPrompt: string;

  /** Execution environment (coding: worktree, research: browser session, etc.) */
  environment: ExecutionEnvironment;

  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Permission policy override */
  permissionPolicy?: 'strict' | 'normal' | 'permissive';

  /** Domain-specific request configuration */
  metadata?: Record<string, unknown>;
}

/** Handle returned when an executor run is started */
export interface ExecutorHandle {
  runId: string;
  adapterId: string;
  status: ExecutorStatus;
  pid?: number;
  startedAt: string;
}

/**
 * Generic artifact produced by an executor run.
 *
 * Coding example: { type: 'diff', content: '--- a/file.ts\n+++ b/file.ts\n...' }
 * Research example: { type: 'report', content: '...', metadata: { sources: [...] } }
 * Image gen example: { type: 'image', content: '/path/to/output.png', metadata: { format: 'png' } }
 */
export interface ExecutorArtifact {
  /** Artifact type identifier */
  type: string;
  /** Artifact content or path */
  content: string;
  /** Human-readable summary */
  summary?: string;
  /** Domain-specific artifact metadata */
  metadata?: Record<string, unknown>;
}

/** Artifacts collected from a completed executor run */
export interface ExecutorArtifacts {
  runId: string;
  /** All artifacts produced by this run */
  artifacts: ExecutorArtifact[];
  /** Final summary of the run outcome */
  finalSummary?: string;
  /** Path to execution logs */
  logPath?: string;
}

// ─── Executor Adapter Interface ──────────────────────────────────────────────

/**
 * Unified executor adapter contract.
 *
 * Domain-agnostic: coding executors (Claude Code, Codex, OpenCode),
 * research executors, image generation executors, and messaging executors
 * all implement this same interface.
 */
export interface ExecutorAdapter {
  /** Unique adapter identifier */
  readonly id: string;
  /** Human-readable display name */
  readonly displayName: string;

  /** Check if this executor is available */
  discover(): Promise<{
    available: boolean;
    version?: string;
    reason?: string;
    transport: 'sdk' | 'cli' | 'api';
  }>;

  /** Return the capability profile for this executor */
  getCapabilities(): ExecutorCapabilityProfile;

  /** Prepare a run (validate inputs, set up environment) */
  prepare(request: ExecutorRunRequest): Promise<ExecutorHandle>;

  /** Start the executor */
  start(handle: ExecutorHandle): Promise<ExecutorHandle>;

  /** Stream normalized events from a running executor */
  streamEvents(runId: string): AsyncIterable<ExecutorEvent>;

  /** Get current status of a run */
  getStatus(runId: string): Promise<{
    status: ExecutorStatus;
    error?: string;
    durationMs?: number;
  }>;

  /** Request cancellation */
  requestCancel(runId: string): Promise<void>;

  /** Collect artifacts from a completed run */
  collectArtifacts(runId: string): Promise<ExecutorArtifacts>;

  /** Clean up resources */
  cleanup(runId: string): Promise<void>;
}
