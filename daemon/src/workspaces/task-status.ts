/**
 * Task status normalization helpers.
 *
 * Canonical statuses are the authoritative set used in the core.
 * Legacy aliases are mapped at API/UI edges for backward compatibility.
 */

/** Canonical task statuses */
export const TASK_STATUSES = {
  DRAFT: "draft",
  QUEUED: "queued",
  RUNNING: "running",
  BLOCKED: "blocked",
  NEEDS_REVIEW: "needs_review",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  DELETED: "deleted",
} as const;

export type CanonicalTaskStatus = (typeof TASK_STATUSES)[keyof typeof TASK_STATUSES];

/**
 * Legacy alias → canonical mapping.
 * Removal window: keep only at persistence/API compatibility edges until the
 * first 1.x schema migration; new core workflow code must emit canonical values.
 */
const LEGACY_MAP: Record<string, CanonicalTaskStatus> = {
  pending: "queued",
  in_progress: "running",
  done: "completed",
};

/** All valid status strings (canonical + legacy) */
export type TaskStatus =
  | CanonicalTaskStatus
  | "pending"
  | "in_progress"
  | "done";

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
  const normalized = normalizeTaskStatus(status);
  return normalized === "completed";
}

/**
 * Check if a task is in a state where it can be executed.
 * Ready statuses: queued (and legacy "pending").
 */
export function isTaskExecutable(status: string): boolean {
  const normalized = normalizeTaskStatus(status);
  return normalized === "queued";
}

/**
 * Check if a task is in a terminal state (will not change further).
 * Terminal: completed, failed, cancelled, deleted.
 */
export function isTaskTerminal(status: string): boolean {
  const normalized = normalizeTaskStatus(status);
  return (
    normalized === "completed" ||
    normalized === "failed" ||
    normalized === "cancelled" ||
    normalized === "deleted"
  );
}

/**
 * Convert a canonical status back to its legacy form (if one exists).
 * Used at API/UI edges for backward compatibility.
 */
export function toLegacyTaskStatus(status: string): string {
  const normalized = normalizeTaskStatus(status);
  switch (normalized) {
    case "queued": return "pending";
    case "running": return "in_progress";
    case "completed": return "done";
    default: return normalized;
  }
}

/** Statuses that should be excluded from active queries */
export const EXCLUDED_STATUSES: readonly string[] = ["deleted"];

/** Statuses that count as "done" for reporting */
export const COMPLETED_STATUSES: readonly string[] = ["completed", "done"];

/** Statuses that are ready for execution */
export const READY_STATUSES: readonly string[] = ["queued", "pending"];
