/**
 * Delivery Gate — prevent unverified success claims.
 *
 * A run cannot claim success until verification passes and
 * the user confirms external writes (merge, push, publish).
 */

import type { VerificationReport } from "./verification.js";

/** Delivery state */
export type DeliveryState =
  | "pending"
  | "verifying"
  | "delivery_ready"
  | "awaiting_confirmation"
  | "delivered"
  | "rejected";

/** Delivery gate decision */
export interface DeliveryDecision {
  state: DeliveryState;
  /** Whether delivery is allowed */
  allowed: boolean;
  /** Reason for the decision */
  reason: string;
  /** Verification report if available */
  verification?: VerificationReport;
  /** Whether user confirmation is required */
  requiresConfirmation: boolean;
  /** What external actions need confirmation */
  pendingExternalActions: string[];
}

/**
 * Evaluate whether a run can proceed to delivery.
 */
export function evaluateDeliveryGate(
  verification: VerificationReport,
  externalActions: string[] = [],
): DeliveryDecision {
  // Failed verification blocks delivery
  if (!verification.allPassed) {
    const failedChecks = verification.results.filter((r) => !r.passed);
    return {
      state: "rejected",
      allowed: false,
      reason: `Verification failed: ${failedChecks.map((c) => c.checkName).join(", ")}`,
      verification,
      requiresConfirmation: false,
      pendingExternalActions: [],
    };
  }

  // External writes require confirmation
  if (externalActions.length > 0) {
    return {
      state: "awaiting_confirmation",
      allowed: false,
      reason: "External actions require user confirmation",
      verification,
      requiresConfirmation: true,
      pendingExternalActions: externalActions,
    };
  }

  // All checks passed, no external actions — ready for delivery
  return {
    state: "delivery_ready",
    allowed: true,
    reason: "All verification checks passed",
    verification,
    requiresConfirmation: false,
    pendingExternalActions: [],
  };
}

/**
 * Confirm delivery after user approval.
 */
export function confirmDelivery(decision: DeliveryDecision): DeliveryDecision {
  if (decision.state !== "awaiting_confirmation") {
    return decision;
  }
  return {
    ...decision,
    state: "delivered",
    allowed: true,
    reason: "User confirmed external actions",
    requiresConfirmation: false,
  };
}
