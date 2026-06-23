/**
 * Plan-Scoped Permission Grants — reduce permission spam while keeping hard boundaries.
 *
 * Instead of asking on every action, users can approve a bounded execution plan once.
 * The system asks again only when execution exceeds the approved plan.
 *
 * Grants are scoped to run/task/workspace/project and have expiry and max-use constraints.
 */

/** Permission decision source */
export type DecisionSource = "system_auto" | "user_memory" | "explicit_user" | "plan_grant";

/** Permission scope level */
export type GrantScope = "run" | "task" | "workspace" | "project";

/** Permission action types */
export type PermissionAction =
  | "file.read"
  | "file.write"
  | "shell.exec"
  | "network.request"
  | "secret.read"
  | "external.write";

/** Risk classification */
export type RiskLevel = "low" | "medium" | "high" | "critical";

/**
 * A scoped permission grant with expiry and use limits.
 */
export interface PermissionGrant {
  /** Unique grant ID */
  id: string;
  /** Who/what this grant applies to */
  subject: {
    agentId: string;
    executorId?: string;
  };
  /** What action is allowed */
  action: PermissionAction;
  /** Resource pattern (glob for paths, command pattern for shell, host for network) */
  resourcePattern: string;
  /** Scope of this grant */
  scope: {
    level: GrantScope;
    id: string;
  };
  /** Constraints */
  constraints: {
    /** When this grant expires (ISO timestamp) */
    expiresAt?: string;
    /** Maximum number of uses (null = unlimited) */
    maxUses?: number;
    /** Require diff preview before external writes */
    requireDiffPreview?: boolean;
    /** Allowed shell commands (for shell.exec) */
    allowedCommands?: string[];
  };
  /** How this grant was created */
  source: DecisionSource;
  /** Risk level this grant covers */
  riskLevel: RiskLevel;
  /** Number of times this grant has been used */
  useCount: number;
  /** When this grant was created */
  createdAt: string;
}

/** In-memory grant store (will be DB-backed) */
const grants = new Map<string, PermissionGrant>();

/**
 * Create a new permission grant.
 */
export function createGrant(
  input: Omit<PermissionGrant, "id" | "useCount" | "createdAt">,
): PermissionGrant {
  const grant: PermissionGrant = {
    ...input,
    id: crypto.randomUUID(),
    useCount: 0,
    createdAt: new Date().toISOString(),
  };
  grants.set(grant.id, grant);
  return grant;
}

/**
 * Check if a grant covers a specific request.
 */
export function findMatchingGrant(
  agentId: string,
  action: PermissionAction,
  resource: string,
  scope: { level: GrantScope; id: string },
  riskLevel: RiskLevel,
): PermissionGrant | null {
  const now = new Date();

  for (const grant of grants.values()) {
    // Check subject match
    if (grant.subject.agentId !== agentId) continue;

    // Check action match
    if (grant.action !== action) continue;

    // Check resource pattern match
    if (!matchesPattern(resource, grant.resourcePattern)) continue;

    // Check scope containment
    if (!isScopeContained(scope, grant.scope)) continue;

    // Check risk level
    if (!isRiskCovered(riskLevel, grant.riskLevel)) continue;

    // Check expiry
    if (grant.constraints.expiresAt && new Date(grant.constraints.expiresAt) < now) continue;

    // Check max uses
    if (
      grant.constraints.maxUses !== undefined &&
      grant.constraints.maxUses !== null &&
      grant.useCount >= grant.constraints.maxUses
    )
      continue;

    return grant;
  }

  return null;
}

/**
 * Record a use of a grant.
 */
export function useGrant(grantId: string): void {
  const grant = grants.get(grantId);
  if (grant) {
    grant.useCount++;
  }
}

/**
 * Revoke a grant.
 */
export function revokeGrant(grantId: string): boolean {
  return grants.delete(grantId);
}

/**
 * Revoke all grants for a scope.
 */
export function revokeGrantsForScope(level: GrantScope, id: string): number {
  let count = 0;
  for (const [grantId, grant] of grants) {
    if (grant.scope.level === level && grant.scope.id === id) {
      grants.delete(grantId);
      count++;
    }
  }
  return count;
}

/**
 * Get all active grants for a scope.
 */
export function getGrantsForScope(level: GrantScope, id: string): PermissionGrant[] {
  const now = new Date();
  return [...grants.values()].filter((g) => {
    if (g.scope.level !== level || g.scope.id !== id) return false;
    if (g.constraints.expiresAt && new Date(g.constraints.expiresAt) < now) return false;
    if (g.constraints.maxUses !== undefined && g.constraints.maxUses !== null && g.useCount >= g.constraints.maxUses) return false;
    return true;
  });
}

/**
 * Get risk defaults — what auto-allows vs what requires approval.
 */
export function getRiskDefaults(): Record<RiskLevel, { autoAllow: boolean; description: string }> {
  return {
    low: {
      autoAllow: true,
      description: "Read workspace files, list directories, git status/diff",
    },
    medium: {
      autoAllow: false,
      description: "Write workspace files, run tests/lint/build, install dependencies",
    },
    high: {
      autoAllow: false,
      description: "Delete files, modify credentials, push to remote, send messages",
    },
    critical: {
      autoAllow: false,
      description: "Wide deletion, system writes, SSH key access, Docker socket",
    },
  };
}

function matchesPattern(resource: string, pattern: string): boolean {
  const regex = pattern
    .replace(/\*\*/g, "{{DOUBLE_STAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\{\{DOUBLE_STAR\}\}/g, ".*")
    .replace(/\?/g, "[^/]");
  return new RegExp(`^${regex}$`).test(resource);
}

function isScopeContained(
  requested: { level: GrantScope; id: string },
  granted: { level: GrantScope; id: string },
): boolean {
  // Broadest to narrowest
  const scopeOrder: GrantScope[] = ["project", "workspace", "task", "run"];
  const requestIdx = scopeOrder.indexOf(requested.level);
  const grantIdx = scopeOrder.indexOf(granted.level);

  // Grant must be at same or broader scope level (lower index = broader)
  if (grantIdx > requestIdx) return false;

  // If same level, IDs must match
  if (grantIdx === requestIdx) return requested.id === granted.id;

  // Grant is at a broader level — always contained
  return true;
}

function isRiskCovered(requested: RiskLevel, granted: RiskLevel): boolean {
  const riskOrder: RiskLevel[] = ["low", "medium", "high", "critical"];
  return riskOrder.indexOf(requested) <= riskOrder.indexOf(granted);
}

/** Reset grants (for testing) */
export function resetGrants(): void {
  grants.clear();
}
