/**
 * Completion evidence — decides whether a run actually produced something.
 *
 * A run reporting success is not evidence: the executor can exit cleanly while
 * having written nothing. A task may only be marked completed when the run
 * carries an artifact that shows work happened.
 */

import type { ExecutorArtifact } from "@jarvis/runtime-protocol";

/** Artifact types that represent real work rather than prose. */
const EVIDENCE_TYPES = new Set(["changed_files", "diff_summary", "generated_file", "test_report"]);

export type EvidenceVerdict =
  | { complete: true; files: string[] }
  | { complete: false; reason: string };

/**
 * Evaluate whether a successful executor run produced deliverable evidence.
 *
 * Text summaries are deliberately not evidence: they are what the previous
 * implementation relied on, and they let empty runs be reported as complete.
 */
export function evaluateCompletionEvidence(artifacts: readonly ExecutorArtifact[]): EvidenceVerdict {
  const changed = artifacts.filter((artifact) => EVIDENCE_TYPES.has(artifact.type));

  if (changed.length === 0) {
    return {
      complete: false,
      reason: "Run succeeded but produced no changes; nothing was delivered",
    };
  }

  const files = new Set<string>();
  for (const artifact of changed) {
    if (artifact.type !== "changed_files") continue;
    for (const line of artifact.content.split(/\r?\n/)) {
      const file = line.trim();
      if (file) files.add(file);
    }
  }

  if (changed.some((artifact) => artifact.type === "changed_files") && files.size === 0) {
    return {
      complete: false,
      reason: "Changed-files artifact was empty; nothing was delivered",
    };
  }

  return { complete: true, files: [...files] };
}
