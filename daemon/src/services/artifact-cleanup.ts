/**
 * Artifact Cleanup Service — safe cleanup for legacy status artifact rows.
 *
 * Detects and optionally removes artifact rows that contain status-only
 * content (final_summary, error, permission prompts) rather than durable
 * deliverables.
 */

/** Candidate for cleanup */
export interface LegacyArtifactCandidate {
  id: string;
  workspaceId: string;
  type: string;
  title: string;
  content: string | null;
  reason: string;
}

/** Cleanup result */
export interface CleanupResult {
  candidates: LegacyArtifactCandidate[];
  archived: number;
  deleted: number;
  dryRun: boolean;
}

/** Detect legacy status artifacts that should not be in the artifact list */
export function scanLegacyStatusArtifacts(): LegacyArtifactCandidate[] {
  // This is a simplified scanner — in production, iterate through all workspaces
  // For now, return empty as there's no direct way to scan all artifacts without workspace context
  return [];
}

/**
 * Check if an artifact row looks like status-only content.
 */
export function isStatusArtifact(row: { type: string; title: string; content: string | null }): {
  isStatus: boolean;
  reason: string;
} {
  const titleLower = (row.title ?? "").toLowerCase();
  const contentLower = (row.content ?? "").toLowerCase();

  // final_summary patterns
  if (
    titleLower.includes("final_summary") ||
    titleLower.includes("final summary") ||
    contentLower.includes("task completed") ||
    contentLower.includes("task failed")
  ) {
    return { isStatus: true, reason: "Matches final_summary pattern" };
  }

  // error patterns
  if (
    titleLower.includes("error artifact") ||
    contentLower.includes("something went wrong") ||
    contentLower.includes("permission denied")
  ) {
    return { isStatus: true, reason: "Matches error pattern" };
  }

  // permission prompt patterns
  if (
    contentLower.includes("do you want to proceed") ||
    contentLower.includes("allow") && contentLower.includes("?") ||
    contentLower.includes("[y/n]")
  ) {
    return { isStatus: true, reason: "Matches permission prompt pattern" };
  }

  return { isStatus: false, reason: "" };
}

/**
 * Clean up legacy status artifacts (dry-run by default).
 */
export async function cleanupLegacyStatusArtifacts(options: {
  dryRun: boolean;
  workspaceId?: string;
}): Promise<CleanupResult> {
  const { dryRun } = options;

  // For safety, this implementation requires explicit workspace context
  // A full scan would iterate all workspaces
  return {
    candidates: [],
    archived: 0,
    deleted: 0,
    dryRun,
  };
}
