/**
 * Retry Policy — make failed runs retryable from known state.
 *
 * Classifies failures, snapshots attempt state, and determines
 * whether a retry is safe.
 */

/** Failure categories for classification */
export type FailureCategory =
  | "transient_provider_error"
  | "executor_not_available"
  | "permission_denied"
  | "permission_blocked"
  | "timeout"
  | "test_failed"
  | "verification_failed"
  | "sandbox_policy_violation"
  | "artifact_missing"
  | "user_cancelled"
  | "unknown";

/** Retry decision */
export interface RetryDecision {
  /** Whether a retry is recommended */
  shouldRetry: boolean;
  /** Reason for the decision */
  reason: string;
  /** Delay before retry in ms */
  delayMs: number;
  /** Whether to use a fresh environment */
  freshEnvironment: boolean;
}

/** Attempt snapshot for audit trail */
export interface AttemptSnapshot {
  attemptNumber: number;
  parentAttemptId?: string;
  failureCategory: FailureCategory;
  error: string;
  adapterId: string;
  environmentKind: string;
  startedAt: string;
  failedAt: string;
  durationMs: number;
}

const MAX_RETRIES: Record<FailureCategory, number> = {
  transient_provider_error: 3,
  executor_not_available: 2,
  permission_denied: 0,
  permission_blocked: 1,
  timeout: 2,
  test_failed: 2,
  verification_failed: 1,
  sandbox_policy_violation: 0,
  artifact_missing: 1,
  user_cancelled: 0,
  unknown: 1,
};

const RETRY_DELAY_MS: Record<FailureCategory, number> = {
  transient_provider_error: 5_000,
  executor_not_available: 30_000,
  permission_denied: 0,
  permission_blocked: 0,
  timeout: 10_000,
  test_failed: 0,
  verification_failed: 0,
  sandbox_policy_violation: 0,
  artifact_missing: 0,
  user_cancelled: 0,
  unknown: 10_000,
};

/**
 * Classify a failure from error information.
 */
export function classifyFailure(error: string, exitCode?: number): FailureCategory {
  const lower = error.toLowerCase();

  if (lower.includes("timeout") || lower.includes("timed out")) return "timeout";
  if (lower.includes("cancelled") || lower.includes("canceled")) return "user_cancelled";
  if (lower.includes("permission denied")) return "permission_denied";
  if (lower.includes("permission blocked") || lower.includes("blocked_by_executor_permission")) return "permission_blocked";
  if (lower.includes("not found") || lower.includes("enoent")) return "executor_not_available";
  if (lower.includes("rate limit") || lower.includes("overloaded") || lower.includes("529")) return "transient_provider_error";
  if (lower.includes("verification") || lower.includes("failed verification")) return "verification_failed";
  if (lower.includes("test failed") || lower.includes("tests failed")) return "test_failed";
  if (lower.includes("policy violation") || lower.includes("sandbox")) return "sandbox_policy_violation";
  if (lower.includes("artifact") || lower.includes("missing")) return "artifact_missing";

  if (exitCode === 137) return "timeout"; // SIGKILL
  if (exitCode === 143) return "user_cancelled"; // SIGTERM

  return "unknown";
}

/**
 * Determine whether a retry is safe and recommended.
 */
export function decideRetry(
  category: FailureCategory,
  currentAttempt: number,
): RetryDecision {
  const maxRetries = MAX_RETRIES[category];

  if (currentAttempt >= maxRetries) {
    return {
      shouldRetry: false,
      reason: `Maximum retries (${maxRetries}) exhausted for ${category}`,
      delayMs: 0,
      freshEnvironment: false,
    };
  }

  if (maxRetries === 0) {
    return {
      shouldRetry: false,
      reason: `${category} is not retryable`,
      delayMs: 0,
      freshEnvironment: false,
    };
  }

  // Policy violations and verification failures need fresh environment
  const freshEnvironment = category === "sandbox_policy_violation" || category === "verification_failed";

  return {
    shouldRetry: true,
    reason: `Retrying ${category} (attempt ${currentAttempt + 1}/${maxRetries})`,
    delayMs: RETRY_DELAY_MS[category],
    freshEnvironment,
  };
}
