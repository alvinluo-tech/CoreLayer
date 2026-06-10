/**
 * Capability Policy — defines what tools can do and under what conditions.
 *
 * This module enforces policies that complement the permission guard:
 * - Critical risk tools always require approval (never auto-allowed)
 * - Session-scoped memories don't persist across runs
 * - Certain tool combinations are restricted
 */

import type { OperationRisk } from "../operations/domain/operation.js";

export type PolicyDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Critical risk tools that ALWAYS require user approval,
 * even if the user has a global auto-approve memory.
 */
const CRITICAL_RISK_ALWAYS_REQUIRES_APPROVAL = true;

/**
 * Risk levels that cannot be auto-approved via memory.
 * Only "low" and "medium" can be auto-approved.
 */
const NON_APPROVIABLE_RISKS: OperationRisk[] = ["high", "critical"];

/**
 * Check if a tool's risk level can be auto-approved.
 * High and critical risk tools always require explicit approval.
 */
export function canAutoApprove(risk: OperationRisk): boolean {
  if (CRITICAL_RISK_ALWAYS_REQUIRES_APPROVAL && risk === "critical") {
    return false;
  }
  return !NON_APPROVIABLE_RISKS.includes(risk);
}

/**
 * Check if a permission memory decision is valid for the given risk level.
 * Returns a policy decision — if not allowed, includes the reason.
 */
export function validatePermissionMemory(
  decision: "auto" | "confirm" | "deny",
  risk: OperationRisk,
  scope: string,
): PolicyDecision {
  if (decision === "auto" && !canAutoApprove(risk)) {
    return {
      allowed: false,
      reason: `Risk level "${risk}" cannot be auto-approved. User must explicitly approve each time.`,
    };
  }

  if (decision === "auto" && scope === "global" && risk === "high") {
    return {
      allowed: false,
      reason: "Global auto-approve is not allowed for high-risk operations. Use project or session scope.",
    };
  }

  return { allowed: true };
}
