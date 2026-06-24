/**
 * Policy Engine — evaluates RuntimeActions against hardline rules,
 * capability grants, and default risk policies.
 */

import type { RuntimeAction, RuntimeActionType, RiskLevel, PolicyDecision } from "@jarvis/runtime-protocol";
import { findMatchingGrant, type PermissionAction } from "./permission-grant.js";

/** Hardline blocklist rules — cannot be overridden by any grant */
interface HardlineRule {
  id: string;
  description: string;
  match: (action: RuntimeAction) => boolean;
  risk: RiskLevel;
}

const HARDLINE_RULES: HardlineRule[] = [
  {
    id: "no-curl-pipe-shell",
    description: "curl|bash or similar piped remote script execution",
    match: (a) =>
      a.type === "shell.exec" &&
      !!a.rawCommand &&
      /curl\s.*\|\s*(ba)?sh|wget\s.*\|\s*(ba)?sh|iwr.*\|\s*iex/i.test(a.rawCommand),
    risk: "critical",
  },
  {
    id: "no-private-key-read",
    description: "Reading SSH private keys or cloud credentials",
    match: (a) =>
      a.type === "file.read" &&
      !!a.target &&
      (/\/\.ssh\/id_/.test(a.target) ||
        /\/\.aws\/credentials/.test(a.target) ||
        /\/\.gcloud\/.*key/.test(a.target)),
    risk: "critical",
  },
  {
    id: "no-workspace-root-delete",
    description: "Deleting workspace root directory",
    match: (a) =>
      a.type === "file.delete" &&
      !!a.target &&
      (a.target === "/" || a.target === "~" || a.target === "$HOME"),
    risk: "critical",
  },
  {
    id: "no-system-dir-write",
    description: "Writing to system directories",
    match: (a) =>
      (a.type === "file.write" || a.type === "file.delete") &&
      !!a.target &&
      (/^\/(etc|usr|bin|sbin|boot|sys|proc)\//.test(a.target) ||
        /^C:\\Windows\\/i.test(a.target)),
    risk: "critical",
  },
  {
    id: "no-docker-socket",
    description: "Docker socket access unless explicitly enabled",
    match: (a) =>
      !!a.rawCommand &&
      /docker\s/.test(a.rawCommand) &&
      !a.metadata?.dockerEnabled,
    risk: "high",
  },
  {
    id: "no-external-publish-without-approval",
    description: "External publish/send without explicit approval",
    match: (a) =>
      a.type === "external.write" &&
      !a.metadata?.explicitlyApproved,
    risk: "high",
  },
];

/** Default risk levels by action type */
const DEFAULT_RISK: Record<RuntimeActionType, RiskLevel> = {
  "file.read": "low",
  "file.write": "medium",
  "file.delete": "high",
  "shell.exec": "medium",
  "network.request": "medium",
  "git.read": "low",
  "git.write": "high",
  "mcp.call": "medium",
  "credential.read": "critical",
  "process.spawn": "medium",
  "external.write": "high",
};

/** Map RuntimeActionType to PermissionAction for grant lookup */
function mapToPermissionAction(type: RuntimeActionType): PermissionAction | null {
  const map: Record<string, PermissionAction> = {
    "file.read": "file.read",
    "file.write": "file.write",
    "shell.exec": "shell.exec",
    "network.request": "network.request",
    "credential.read": "secret.read",
    "external.write": "external.write",
  };
  return map[type] ?? null;
}

/**
 * Evaluate a RuntimeAction against policy rules.
 */
export function evaluatePolicy(action: RuntimeAction): PolicyDecision {
  // 1. Check hardline blocklist — cannot be overridden
  for (const rule of HARDLINE_RULES) {
    if (rule.match(action)) {
      return {
        decision: "hard_deny",
        risk: rule.risk,
        reason: `Hardline block: ${rule.description}`,
        hardlineRuleId: rule.id,
      };
    }
  }

  // 2. Determine base risk level
  const risk = DEFAULT_RISK[action.type] ?? "medium";

  // 3. Low risk inside workspace — auto-allow
  if (risk === "low" && action.workspaceId) {
    return {
      decision: "allow",
      risk,
      reason: "Low-risk action inside workspace",
    };
  }

  // 4. Check for matching capability grant
  if (action.agentId && action.workspaceId) {
    const permissionAction = mapToPermissionAction(action.type);
    if (permissionAction) {
      const grant = findMatchingGrant(
        action.agentId,
        permissionAction,
        action.target ?? "*",
        { level: "workspace", id: action.workspaceId },
        risk,
      );

      if (grant) {
        return {
          decision: "allow",
          risk,
          reason: `Matched grant: ${grant.id}`,
          matchedGrantId: grant.id,
        };
      }
    }
  }

  // 5. Medium risk — require approval with workspace scope
  if (risk === "medium") {
    return {
      decision: "require_approval",
      risk,
      reason: "Medium-risk action requires approval",
      requiredScope: action.workspaceId
        ? { level: "workspace", id: action.workspaceId }
        : { level: "run", id: action.runId ?? "unknown" },
    };
  }

  // 6. High risk — require explicit approval
  if (risk === "high") {
    return {
      decision: "require_approval",
      risk,
      reason: "High-risk action requires explicit approval",
      requiredScope: { level: "run", id: action.runId ?? "unknown" },
    };
  }

  // 7. Critical risk — hard deny by default
  return {
    decision: "hard_deny",
    risk,
    reason: "Critical-risk action denied by default",
  };
}

/**
 * Get all hardline rule IDs (for testing).
 */
export function getHardlineRuleIds(): string[] {
  return HARDLINE_RULES.map((r) => r.id);
}
