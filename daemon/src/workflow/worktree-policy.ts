/**
 * Worktree Policy — validates and enforces worktree path constraints
 * before spawning coding executors.
 *
 * Requirements:
 * - repoPath must be set
 * - worktreePath must be within allowed directories
 * - All decisions are logged to the audit log
 */

import { existsSync, statSync } from "fs";
import { resolve, relative, isAbsolute } from "path";
import { logAuditEntry } from "../persistence/audit-log.js";

export interface WorktreePolicyConfig {
  /** Base directories that worktrees must reside under. Defaults to [appDataDir]. */
  allowedBaseDirs: string[];
  /** Whether to require worktreePath (true) or fall back to repoPath. */
  requireWorktreePath: boolean;
}

export interface WorktreeDecision {
  allowed: boolean;
  reason: string;
  worktreePath: string;
}

const DEFAULT_CONFIG: WorktreePolicyConfig = {
  allowedBaseDirs: [],
  requireWorktreePath: false,
};

let config: WorktreePolicyConfig = { ...DEFAULT_CONFIG };

export function configureWorktreePolicy(overrides: Partial<WorktreePolicyConfig>): void {
  config = { ...config, ...overrides };
}

export function getWorktreePolicyConfig(): WorktreePolicyConfig {
  return { ...config };
}

/**
 * Validate that a proposed worktree path is acceptable.
 * Logs the decision to the audit log.
 */
export async function validateWorktreePath(
  repoPath: string | undefined,
  worktreePath: string | undefined,
  actor: string = "coding-runtime",
): Promise<WorktreeDecision> {
  // Requirement 1: repoPath must be set
  if (!repoPath) {
    const decision: WorktreeDecision = {
      allowed: false,
      reason: "repoPath is required but was not provided",
      worktreePath: worktreePath ?? "",
    };
    await logAuditEntry({
      actor,
      action: "worktree.validate",
      resource: "worktree",
      decision: "deny",
      result: decision.reason,
    });
    return decision;
  }

  // Determine effective worktree path
  const effectivePath = worktreePath ?? repoPath;

  // Requirement 2: path must exist and be a directory
  if (!existsSync(effectivePath)) {
    const decision: WorktreeDecision = {
      allowed: false,
      reason: `Path does not exist: ${effectivePath}`,
      worktreePath: effectivePath,
    };
    await logAuditEntry({
      actor,
      action: "worktree.validate",
      resource: effectivePath,
      decision: "deny",
      result: decision.reason,
    });
    return decision;
  }

  try {
    const stat = statSync(effectivePath);
    if (!stat.isDirectory()) {
      const decision: WorktreeDecision = {
        allowed: false,
        reason: `Path is not a directory: ${effectivePath}`,
        worktreePath: effectivePath,
      };
      await logAuditEntry({
        actor,
        action: "worktree.validate",
        resource: effectivePath,
        decision: "deny",
        result: decision.reason,
      });
      return decision;
    }
  } catch {
    const decision: WorktreeDecision = {
      allowed: false,
      reason: `Cannot access path: ${effectivePath}`,
      worktreePath: effectivePath,
    };
    await logAuditEntry({
      actor,
      action: "worktree.validate",
      resource: effectivePath,
      decision: "deny",
      result: decision.reason,
    });
    return decision;
  }

  // Requirement 3: path must be within allowed base dirs (if configured)
  if (config.allowedBaseDirs.length > 0 && isAbsolute(effectivePath)) {
    const resolvedPath = resolve(effectivePath);
    const isAllowed = config.allowedBaseDirs.some((base) => {
      const resolvedBase = resolve(base);
      const rel = relative(resolvedBase, resolvedPath);
      return !rel.startsWith("..") && rel !== "";
    });

    if (!isAllowed) {
      const decision: WorktreeDecision = {
        allowed: false,
        reason: `Path "${effectivePath}" is not within allowed directories: ${config.allowedBaseDirs.join(", ")}`,
        worktreePath: effectivePath,
      };
      await logAuditEntry({
        actor,
        action: "worktree.validate",
        resource: effectivePath,
        decision: "deny",
        result: decision.reason,
      });
      return decision;
    }
  }

  // All checks passed
  const decision: WorktreeDecision = {
    allowed: true,
    reason: "Worktree path validated successfully",
    worktreePath: effectivePath,
  };
  await logAuditEntry({
    actor,
    action: "worktree.validate",
    resource: effectivePath,
    decision: "allow",
    result: "validated",
  });
  return decision;
}
