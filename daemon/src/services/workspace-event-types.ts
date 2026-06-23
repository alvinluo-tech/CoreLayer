/**
 * Workspace Event Types — typed vocabulary for workspace timeline events.
 *
 * Each event type maps to a specific stage in the workspace lifecycle.
 * The payload shape is defined per event for structured timeline rendering.
 */

// ── Event Type Literals ──────────────────────────────────────────────

export type WorkspaceEventType =
  | "workspace.created"
  | "workspace.spec.generated"
  | "workspace.spec.fallback"
  | "workspace.project.created"
  | "workspace.tasks.decomposed"
  | "workspace.team.assigned"
  | "workspace.task.queued"
  | "workspace.task.started"
  | "workspace.task.completed"
  | "workspace.task.failed"
  | "workspace.task.unblocked"
  | "workspace.task.blocked"
  | "workspace.run.started"
  | "workspace.run.completed"
  | "workspace.run.failed"
  | "workspace.autonomy.decision"
  | "workspace.artifact.created"
  | "workspace.verification.completed"
  | "workspace.blocked"
  | "workspace.orchestrated";

// ── Severity ─────────────────────────────────────────────────────────

export type EventSeverity = "info" | "success" | "warning" | "error";

// ── Payload Shapes ───────────────────────────────────────────────────

export interface WorkspaceCreatedPayload {
  workspaceId: string;
  goal: string;
}

export interface SpecGeneratedPayload {
  workspaceId: string;
  projectId: string;
  techStack: string | null;
}

export interface SpecFallbackPayload {
  workspaceId: string;
  projectId: string;
  reason: string;
}

export interface ProjectCreatedPayload {
  workspaceId: string;
  projectId: string;
  projectName: string;
  rootPath: string;
}

export interface TasksDecomposedPayload {
  workspaceId: string;
  projectId: string;
  taskCount: number;
  dependencyCount: number;
}

export interface TeamAssignedPayload {
  workspaceId: string;
  agentCount: number;
  roles: string[];
}

export interface TaskQueuedPayload {
  workspaceId: string;
  projectId: string;
  taskId: string;
  taskTitle: string;
  assignedAgentId?: string;
}

export interface TaskStartedPayload {
  workspaceId: string;
  projectId: string;
  taskId: string;
  taskTitle: string;
  agentRunId: string;
}

export interface TaskCompletedPayload {
  workspaceId: string;
  projectId: string;
  taskId: string;
  taskTitle: string;
  durationMs?: number;
}

export interface TaskFailedPayload {
  workspaceId: string;
  projectId: string;
  taskId: string;
  taskTitle: string;
  error: string;
}

export interface TaskUnblockedPayload {
  workspaceId: string;
  projectId: string;
  taskId: string;
  taskTitle: string;
  unblockedBy: string;
}

export interface TaskBlockedPayload {
  workspaceId: string;
  projectId: string;
  taskId: string;
  taskTitle: string;
  blockedBy: string[];
}

export interface RunStartedPayload {
  workspaceId: string;
  projectId: string;
  taskId: string;
  agentRunId: string;
  runtimeId: string;
  repoPath?: string;
  worktreePath?: string;
  timeoutMs?: number;
}

export interface RunCompletedPayload {
  workspaceId: string;
  projectId: string;
  taskId: string;
  agentRunId: string;
  runtimeId: string;
  durationMs: number;
  artifactCount: number;
}

export interface RunFailedPayload {
  workspaceId: string;
  projectId: string;
  taskId: string;
  agentRunId: string;
  runtimeId: string;
  error: string;
  interactionKind?: string;
}

export interface AutonomyDecisionPayload {
  workspaceId: string;
  agentRunId: string;
  action: "approve" | "deny" | "respond";
  reason: string;
  interactionKind?: string;
}

export interface ArtifactCreatedPayload {
  workspaceId: string;
  projectId?: string;
  taskId?: string;
  agentRunId?: string;
  artifactType: string;
  artifactIndex: number;
  path?: string;
  metadata?: Record<string, unknown>;
}

export interface VerificationCompletedPayload {
  workspaceId: string;
  projectId?: string;
  taskId?: string;
  agentRunId?: string;
  command: string;
  exitCode: number;
  passed: boolean;
  summary: string;
}

export interface WorkspaceBlockedPayload {
  workspaceId: string;
  reason: string;
  blockedTaskIds?: string[];
}

export interface OrchestratedPayload {
  workspaceId: string;
  taskCount: number;
  agentCount: number;
  hasSpec: boolean;
  enqueuedRuns: number;
}

// ── Discriminated Union ──────────────────────────────────────────────

export type WorkspaceEventPayload =
  | WorkspaceCreatedPayload
  | SpecGeneratedPayload
  | SpecFallbackPayload
  | ProjectCreatedPayload
  | TasksDecomposedPayload
  | TeamAssignedPayload
  | TaskQueuedPayload
  | TaskStartedPayload
  | TaskCompletedPayload
  | TaskFailedPayload
  | TaskUnblockedPayload
  | TaskBlockedPayload
  | RunStartedPayload
  | RunCompletedPayload
  | RunFailedPayload
  | AutonomyDecisionPayload
  | ArtifactCreatedPayload
  | VerificationCompletedPayload
  | WorkspaceBlockedPayload
  | OrchestratedPayload;

// ── Emitter Input ────────────────────────────────────────────────────

export interface EmitWorkspaceEventInput {
  type: WorkspaceEventType;
  title: string;
  summary?: string;
  severity?: EventSeverity;
  actor?: string;
  workspaceId: string;
  projectId?: string;
  taskId?: string;
  agentRunId?: string;
  runtimeId?: string;
  artifactId?: string;
  payload: WorkspaceEventPayload;
}
