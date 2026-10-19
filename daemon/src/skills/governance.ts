/**
 * Skill governance — decides whether a skill may run without being asked.
 *
 * A skill is procedural knowledge that accumulates over time. Accumulating is
 * not the same as improving: a skill may have been derived from one lucky run,
 * may not apply to this repository, or may have started failing. Trust has to
 * be earned from recorded outcomes and can be withdrawn.
 */

import type { SkillManifest } from "./types.js";

/** Consecutive failures after which an auto skill stops running unattended. */
export const FAILURE_THRESHOLD = 3;

export type SkillTrust =
  | { auto: true; reason: string }
  | { auto: false; reason: string };

/**
 * Evaluate whether a skill may execute automatically.
 *
 * Anything not positively established results in "suggest": the skill is still
 * available, but the caller must request it explicitly.
 */
export function evaluateSkillTrust(manifest: SkillManifest): SkillTrust {
  const provenance = manifest.provenance;

  if (manifest.deprecatedAt) {
    return {
      auto: false,
      reason: `Skill deprecated at ${manifest.deprecatedAt}${manifest.deprecationReason ? `: ${manifest.deprecationReason}` : ""}`,
    };
  }

  if (manifest.autonomy === "suggest") {
    return { auto: false, reason: "Skill is marked suggest-only" };
  }

  const history = provenance?.history ?? [];
  const consecutiveFailures = trailingFailures(history.map((record) => record.success));
  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    return {
      auto: false,
      reason: `Skill failed ${consecutiveFailures} consecutive times; demoted to suggest-only`,
    };
  }

  // Never succeeded: it has not demonstrated that it works.
  if (!history.some((record) => record.success)) {
    return {
      auto: false,
      reason: history.length === 0
        ? "Skill has no recorded successful execution"
        : "Skill has never succeeded",
    };
  }

  return {
    auto: true,
    reason: `Skill succeeded ${history.filter((record) => record.success).length} of ${history.length} recorded runs`,
  };
}

/** Number of failures at the end of the history. */
function trailingFailures(outcomes: boolean[]): number {
  let count = 0;
  for (let i = outcomes.length - 1; i >= 0 && !outcomes[i]; i--) count++;
  return count;
}

/**
 * Append an execution outcome, dropping the oldest records so manifests do not
 * grow without bound.
 */
export function recordExecution(
  manifest: SkillManifest,
  record: { runId?: string; success: boolean; error?: string },
  maxRecords = 20,
): SkillManifest {
  const history = [...(manifest.provenance?.history ?? []), {
    runId: record.runId,
    success: record.success,
    executedAt: new Date().toISOString(),
    error: record.error,
  }].slice(-maxRecords);

  return {
    ...manifest,
    provenance: { ...manifest.provenance, history },
  };
}
