/**
 * Task status normalization helpers (frontend mirror).
 *
 * Canonical statuses are the authoritative set used in the core.
 * Legacy aliases are mapped at API/UI edges for backward compatibility.
 */

/** Canonical task statuses */
export const TASK_STATUSES = {
  DRAFT: 'draft',
  QUEUED: 'queued',
  RUNNING: 'running',
  BLOCKED: 'blocked',
  NEEDS_REVIEW: 'needs_review',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  DELETED: 'deleted',
} as const;

export type CanonicalTaskStatus = (typeof TASK_STATUSES)[keyof typeof TASK_STATUSES];

/** Legacy alias → canonical mapping */
const LEGACY_MAP: Record<string, CanonicalTaskStatus> = {
  pending: 'queued',
  in_progress: 'running',
  done: 'completed',
};

/** All valid status strings (canonical + legacy) */
export type TaskStatus = CanonicalTaskStatus | 'pending' | 'in_progress' | 'done';

/**
 * Normalize a legacy status alias to its canonical form.
 * Returns the input unchanged if it's already canonical.
 */
export function normalizeTaskStatus(status: string): CanonicalTaskStatus {
  return LEGACY_MAP[status] ?? (status as CanonicalTaskStatus);
}

/**
 * Check if a task status represents completion.
 * Accepts both canonical ("completed") and legacy ("done") forms.
 */
export function isTaskComplete(status: string): boolean {
  return normalizeTaskStatus(status) === 'completed';
}

/**
 * Check if a task is in a terminal state (will not change further).
 * Terminal: completed, failed, cancelled, deleted.
 */
export function isTaskTerminal(status: string): boolean {
  const normalized = normalizeTaskStatus(status);
  return (
    normalized === 'completed' ||
    normalized === 'failed' ||
    normalized === 'cancelled' ||
    normalized === 'deleted'
  );
}
