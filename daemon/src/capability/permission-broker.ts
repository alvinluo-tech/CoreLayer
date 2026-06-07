/**
 * PermissionBroker — decides allow/deny/approval_required for capability requests.
 *
 * Rules:
 * - file.read / dir.list: always allow (low risk)
 * - file.write / file.patch: approval_required (medium risk) — show diff
 * - file.delete: approval_required (high risk)
 * - shell.exec: check allowlist first; unmatched = critical risk → deny
 * - screenshot / window.control: approval_required (high risk)
 * - notification: allow (low risk)
 * - network.request: depends on context (medium risk)
 *
 * All decisions are written to the persistent AuditLog.
 */

import type { RiskLevel } from "@jarvis/types";
import type {
  CapabilityRequest,
  CapabilityDecisionResult,
  OSCapability,
} from "./types.js";
import { matchAllowlist } from "./shell-allowlist.js";

/** Default risk level for each capability */
const CAPABILITY_RISK: Record<OSCapability, RiskLevel> = {
  "file.read": "low",
  "file.write": "medium",
  "file.delete": "high",
  "dir.list": "low",
  "dir.select": "low",
  "shell.exec": "critical",
  "screenshot": "high",
  "window.control": "high",
  "notification": "low",
  "network.request": "medium",
};

export class PermissionBroker {
  /**
   * Evaluate a capability request and return a decision.
   */
  evaluate(request: CapabilityRequest): CapabilityDecisionResult {
    const { capability, resource, riskLevel, proposedAction, command } = request;

    // Shell exec: check allowlist
    if (capability === "shell.exec" && command) {
      const match = matchAllowlist(command);
      if (match) {
        const effectiveRisk = match.riskOverride ?? riskLevel;
        if (effectiveRisk === "low") {
          return {
            decision: "allow",
            reason: `Shell command allowed by allowlist: ${match.description}`,
            allowlistMatch: match.pattern,
          };
        }
        return {
          decision: "approval_required",
          reason: `Shell command matches allowlist (${match.description}) but risk level ${effectiveRisk} requires approval`,
          allowlistMatch: match.pattern,
        };
      }
      // Not in allowlist — critical risk
      return {
        decision: "deny",
        reason: `Shell command not in allowlist and risk level is critical: ${resource}`,
      };
    }

    // File write: always require approval (show diff)
    if (capability === "file.write" && proposedAction === "write") {
      return {
        decision: "approval_required",
        reason: `File write requires approval: ${resource}`,
      };
    }

    // File patch: require approval
    if (capability === "file.write" && proposedAction === "patch") {
      return {
        decision: "approval_required",
        reason: `File patch requires approval: ${resource}`,
      };
    }

    // File delete: always require approval
    if (capability === "file.delete") {
      return {
        decision: "approval_required",
        reason: `File deletion requires approval: ${resource}`,
      };
    }

    // Screenshot / window control: require approval
    if (capability === "screenshot" || capability === "window.control") {
      return {
        decision: "approval_required",
        reason: `${capability} requires approval: ${resource}`,
      };
    }

    // Low-risk capabilities: auto-allow
    const defaultRisk = CAPABILITY_RISK[capability] ?? "medium";
    if (defaultRisk === "low") {
      return {
        decision: "allow",
        reason: `${capability} is low risk, auto-allowed`,
      };
    }

    // Medium/high risk: require approval
    return {
      decision: "approval_required",
      reason: `${capability} requires approval (risk: ${defaultRisk})`,
    };
  }

  /**
   * Get the default risk level for a capability.
   */
  getDefaultRisk(capability: OSCapability): RiskLevel {
    return CAPABILITY_RISK[capability] ?? "medium";
  }
}
