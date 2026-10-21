/**
 * Classify why a coding attempt failed: the agent's fault, or ours.
 *
 * The distinction matters because the two need different responses. An agent
 * failure is evidence about the task (wrong plan, broken code) and belongs in
 * quality statistics. An infrastructure failure is evidence about the
 * environment (the executor never started, the runner crashed, the worktree
 * could not be created) and counting it as an agent failure poisons every
 * success-rate number computed from the same table.
 *
 * The classification is intentionally conservative: anything not recognised is
 * an agent failure, so an unknown error is never excused as "infra".
 */

export type FailureVerdict = "agent" | "infra";

/** Errors raised before the executor ever ran a turn. */
const INFRA_SETUP_PATTERNS: ReadonlyArray<RegExp> = [
  /^Executor adapter .* not (available|found)/i,
  /^Adapter .* is not available/i,
  /not found\. Install it/i,
  /^Failed to (create|prepare) (the )?(sandbox|worktree|environment)/i,
  /^git worktree add failed/i,
  /^repoPath is required/i,
  /working directory is within a blocked system path/i,
  /Directory does not exist/i,
];

/** Transport-level failures: the executor died or could not be driven. */
const INFRA_RUNTIME_PATTERNS: ReadonlyArray<RegExp> = [
  /spawn .* ENOENT/i,
  /ENOSPC|EMFILE|EACCES|EPERM/,
  /Process timed out after \d+ms/i,
  /Exit code \d+ with no output/i,
  /socket hang up|ECONNRESET|ECONNREFUSED|ETIMEDOUT/i,
  /out of memory|heap limit/i,
];

/** The provider answered, and the answer was a capacity or auth problem. */
const INFRA_PROVIDER_PATTERNS: ReadonlyArray<RegExp> = [
  /\bHTTP (?:401|403|429|5\d\d)\b/i,
  /rate.?limit/i,
  /insufficient (credit|balance|quota)/i,
  /model_not_found/i,
];

export function classifyFailure(input: {
  error?: string | null;
  /** Verification reports, when the failure came after the executor succeeded. */
  verificationFailed?: boolean;
}): FailureVerdict {
  const error = (input.error ?? "").trim();
  if (!error) return "agent";

  for (const pattern of [...INFRA_SETUP_PATTERNS, ...INFRA_RUNTIME_PATTERNS, ...INFRA_PROVIDER_PATTERNS]) {
    if (pattern.test(error)) return "infra";
  }
  return "agent";
}

/**
 * Verification failures are behavioural unless the check itself could not run.
 * A test command that exits with 127 never tested the agent's work.
 */
export function classifyVerificationFailure(messages: readonly string[]): FailureVerdict {
  const joined = messages.join("\n");
  if (/command not found|127|\bENOENT\b|cannot find module/i.test(joined)) return "infra";
  return "agent";
}
