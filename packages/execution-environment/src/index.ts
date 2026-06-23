/**
 * Execution Environment — Domain-Agnostic Runtime Contract
 *
 * This package defines the generic execution environment model used by
 * the Agent Execution OS. It is NOT coding-specific.
 *
 * Domain implementations:
 * - Coding: GitWorktreeEnvironment (git worktree, shell commands, file diffs)
 * - Research: BrowserSessionEnvironment (browser automation, web scraping)
 * - Image generation: CanvasEnvironment (render pipeline, image artifacts)
 * - Messaging: MessageDraftEnvironment (draft composition, tone checks)
 * - Desktop control: DesktopSessionEnvironment (UI automation, screenshots)
 */

// ─── Access Policy ───────────────────────────────────────────────────────────

/** How the environment handles access to resources */
export interface AccessPolicy {
  /** What file paths are accessible (glob patterns, or '*' for all) */
  allowedPaths?: string[];
  /** What file paths are explicitly denied */
  deniedPaths?: string[];
  /** Network access mode */
  network?: 'none' | 'allowlist' | 'full';
  /** Allowed network hosts (when network=allowlist) */
  allowedHosts?: string[];
  /** Shell/command execution mode */
  shell?: 'none' | 'allowlist' | 'approval' | 'full';
  /** Allowed shell commands (when shell=allowlist) */
  allowedCommands?: string[];
  /** Secret injection mode */
  secrets?: 'none' | 'explicit';
  /** Allowed secret references */
  allowedSecretRefs?: string[];
}

// ─── Environment State ───────────────────────────────────────────────────────

/** Current state of an environment session */
export type EnvironmentState =
  | 'created'
  | 'preparing'
  | 'ready'
  | 'active'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'disposed';

// ─── Action Types ────────────────────────────────────────────────────────────

/**
 * Generic action request — does NOT require shell execution.
 *
 * Coding example: { kind: 'shell', command: 'npm test' }
 * Research example: { kind: 'navigate', url: 'https://arxiv.org' }
 * Image gen example: { kind: 'render', prompt: 'sunset over mountains' }
 * Messaging example: { kind: 'draft', tone: 'professional', content: '...' }
 */
export interface ActionRequest {
  /** Action kind identifier */
  readonly kind: string;
  /** Action-specific parameters */
  parameters?: Record<string, unknown>;
  /** Timeout for this specific action */
  timeoutMs?: number;
}

export interface ActionResult {
  /** Whether the action succeeded */
  success: boolean;
  /** Action kind that was executed */
  kind: string;
  /** Result data (domain-specific) */
  data?: unknown;
  /** Error message if failed */
  error?: string;
  /** Duration of the action */
  durationMs?: number;
}

// ─── Command Result (for shell-capable environments) ─────────────────────────

/** Result of executing a shell command (only relevant for shell-capable environments) */
export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

// ─── File Operations ─────────────────────────────────────────────────────────

export interface FileReadResult {
  path: string;
  content: string;
  encoding: string;
  size: number;
}

export interface FileWriteResult {
  path: string;
  bytesWritten: number;
}

// ─── Artifact ────────────────────────────────────────────────────────────────

/**
 * Generic artifact produced in an environment.
 *
 * Coding: { kind: 'diff', content: '--- a/file.ts\n+++ b/file.ts\n...' }
 * Research: { kind: 'report', content: '...', metadata: { sources: [...] } }
 * Image: { kind: 'image', content: '/path/to/output.png', metadata: { format: 'png', width: 1024 } }
 * Messaging: { kind: 'draft', content: 'Dear...', metadata: { tone: 'formal' } }
 */
export interface Artifact {
  /** Unique artifact identifier */
  id: string;
  /** Artifact kind (domain-specific) */
  kind: string;
  /** Artifact content or path */
  content: string;
  /** Human-readable summary */
  summary?: string;
  /** Domain-specific metadata */
  metadata?: Record<string, unknown>;
  /** Timestamp when artifact was produced */
  createdAt: string;
}

// ─── Environment Session Request ─────────────────────────────────────────────

export interface EnvironmentSessionRequest {
  /** Workspace this session belongs to */
  workspaceId: string;
  /** Project within the workspace */
  projectId?: string;
  /** Run this session is for */
  runId: string;
  /** Agent requesting the session */
  agentId: string;

  /** Environment kind (coding: 'git-worktree', research: 'browser-session', etc.) */
  environmentKind: string;

  /** Working directory or primary context path */
  workingDirectory?: string;

  /** Access policy for this session */
  accessPolicy?: AccessPolicy;

  /** Domain-specific session configuration */
  metadata?: Record<string, unknown>;
}

// ─── Environment Session ─────────────────────────────────────────────────────

export interface EnvironmentSession {
  /** Unique session identifier */
  readonly id: string;
  /** Environment kind */
  readonly environmentKind: string;
  /** Current state */
  state: EnvironmentState;
  /** Working directory or primary context path */
  workingDirectory: string | null;
  /** Workspace ID */
  readonly workspaceId: string;
  /** Run ID */
  readonly runId: string;
  /** Agent ID */
  readonly agentId: string;
  /** Session creation timestamp */
  readonly createdAt: string;
}

// ─── Execution Environment Interface ─────────────────────────────────────────

/**
 * Domain-agnostic execution environment contract.
 *
 * Implementations:
 * - GitWorktreeEnvironment (coding)
 * - BrowserSessionEnvironment (research)
 * - CanvasEnvironment (image generation)
 * - MessageDraftEnvironment (messaging)
 * - DesktopSessionEnvironment (desktop control)
 */
export interface ExecutionEnvironment {
  /** Environment kind identifier */
  readonly kind: string;

  /** Create a new environment session */
  createSession(request: EnvironmentSessionRequest): Promise<EnvironmentSession>;

  /** Get current session state */
  getSession(sessionId: string): Promise<EnvironmentSession | null>;

  /** Execute a generic action (does not require shell) */
  executeAction(sessionId: string, action: ActionRequest): Promise<ActionResult>;

  /** Execute a shell command (only for shell-capable environments) */
  executeCommand?(sessionId: string, command: string, timeoutMs?: number): Promise<CommandResult>;

  /** Read a file from the environment */
  readFile(sessionId: string, path: string): Promise<FileReadResult>;

  /** Write a file to the environment */
  writeFile(sessionId: string, path: string, content: string): Promise<FileWriteResult>;

  /** Collect all artifacts produced in this session */
  collectArtifacts(sessionId: string): Promise<Artifact[]>;

  /** Dispose of the environment session and clean up resources */
  dispose(sessionId: string): Promise<void>;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
}

export function validateSessionRequest(request: EnvironmentSessionRequest): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!request.workspaceId) {
    errors.push({ field: 'workspaceId', message: 'workspaceId is required' });
  }
  if (!request.runId) {
    errors.push({ field: 'runId', message: 'runId is required' });
  }
  if (!request.agentId) {
    errors.push({ field: 'agentId', message: 'agentId is required' });
  }
  if (!request.environmentKind) {
    errors.push({ field: 'environmentKind', message: 'environmentKind is required' });
  }

  return errors;
}

export function validateActionRequest(action: ActionRequest): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!action.kind) {
    errors.push({ field: 'kind', message: 'kind is required' });
  }

  return errors;
}
