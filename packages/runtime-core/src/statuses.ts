/**
 * Canonical status constants shared across daemon, frontend, and runtime packages.
 *
 * Source of truth for all run/task status values used in the system.
 */

export const RunStatuses = {
  QUEUED: 'queued',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  WAITING_FOR_APPROVAL: 'waiting_for_approval',
} as const;

export type RunStatus = (typeof RunStatuses)[keyof typeof RunStatuses];

export const TaskStatuses = {
  DRAFT: 'draft',
  QUEUED: 'queued',
  RUNNING: 'running',
  BLOCKED: 'blocked',
  FAILED: 'failed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
} as const;

export type TaskStatus = (typeof TaskStatuses)[keyof typeof TaskStatuses];

export const RunModes = {
  CHAT: 'chat',
  VOICE: 'voice',
  TICK: 'tick',
  SCHEDULED: 'scheduled',
  WORKFLOW: 'workflow',
  REGENERATE: 'regenerate',
} as const;

export type RunMode = (typeof RunModes)[keyof typeof RunModes];

/** Active run statuses (queued or running — consuming a slot) */
export const ACTIVE_RUN_STATUSES: readonly RunStatus[] = [RunStatuses.QUEUED, RunStatuses.RUNNING];

/** Terminal run statuses (finished — no slot held) */
export const TERMINAL_RUN_STATUSES: readonly RunStatus[] = [
  RunStatuses.SUCCEEDED,
  RunStatuses.FAILED,
  RunStatuses.CANCELLED,
];

export function isRunStatus(value: unknown): value is RunStatus {
  return Object.values(RunStatuses).includes(value as RunStatus);
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return Object.values(TaskStatuses).includes(value as TaskStatus);
}

export function isActiveRun(status: RunStatus): boolean {
  return ACTIVE_RUN_STATUSES.includes(status);
}

export function isTerminalRun(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.includes(status);
}
