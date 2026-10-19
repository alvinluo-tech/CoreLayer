/**
 * Delivery Service — surfaces agent branches for human review and merges them.
 *
 * Executor runs land their work on `agent/<runId>` branches inside the project
 * repository. Nothing merges automatically: an agent's changes are proposals
 * until a person accepts them. This module lists those proposals per project
 * and performs the merge when asked.
 */

import { existsSync } from "node:fs";
import { execGit, allowGitRoot } from "../capabilities/adapters/git-command-adapter.js";
import { logAuditEntry } from "../persistence/audit-log.js";

export interface DeliveredBranch {
  branch: string;
  sha: string;
  subject: string;
  commitsAhead: number;
  files: string[];
  merged: boolean;
}

const AGENT_BRANCH_PREFIX = "agent/";

/** Default branch of the repository, falling back to the currently checked out one. */
async function resolveBaseBranch(repoPath: string): Promise<string> {
  try {
    const head = (await execGit(["symbolic-ref", "--short", "HEAD"], repoPath, "delivery-service")).trim();
    if (head) return head;
  } catch {
    // Detached HEAD or no commits; fall through.
  }
  return "master";
}

/**
 * List agent branches that carry work not yet merged into the base branch.
 */
export async function listDeliveredBranches(repoPath: string): Promise<DeliveredBranch[]> {
  if (!existsSync(repoPath)) return [];
  allowGitRoot(repoPath);

  const base = await resolveBaseBranch(repoPath);

  let names: string[] = [];
  try {
    const out = await execGit(
      ["for-each-ref", "--format=%(refname:short)", `refs/heads/${AGENT_BRANCH_PREFIX}`],
      repoPath,
      "delivery-service",
    );
    names = out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }

  const branches: DeliveredBranch[] = [];
  for (const branch of names) {
    let sha = "";
    let subject = "";
    let commitsAhead = 0;
    let files: string[] = [];
    try {
      sha = (await execGit(["rev-parse", branch], repoPath, "delivery-service")).trim();
      subject = (await execGit(["log", "-1", "--format=%s", branch], repoPath, "delivery-service")).trim();
      const count = (await execGit(["rev-list", "--count", `${base}..${branch}`], repoPath, "delivery-service")).trim();
      commitsAhead = Number.parseInt(count, 10) || 0;
      if (commitsAhead === 0) continue;
      const diff = await execGit(["diff", "--name-only", base, branch], repoPath, "delivery-service");
      files = diff.split(/\r?\n/).filter(Boolean);
    } catch {
      continue;
    }
    branches.push({ branch, sha, subject, commitsAhead, files, merged: false });
  }

  return branches;
}

/**
 * Merge an agent branch into the base branch.
 *
 * Uses --no-ff so the delivery stays visible as a unit in history.
 * Returns a failure rather than forcing through a conflict.
 */
export async function mergeDeliveredBranch(
  repoPath: string,
  branch: string,
  actor = "user",
): Promise<{ merged: boolean; reason: string }> {
  if (!branch.startsWith(AGENT_BRANCH_PREFIX)) {
    return { merged: false, reason: `Refusing to merge non-agent branch: ${branch}` };
  }
  if (!existsSync(repoPath)) {
    return { merged: false, reason: `Repository path does not exist: ${repoPath}` };
  }
  allowGitRoot(repoPath);

  const base = await resolveBaseBranch(repoPath);
  const context = { reason: `Merge agent branch ${branch}`, userRequested: true };

  try {
    await execGit(["merge", "--no-ff", "-m", `Merge ${branch}`, branch], repoPath, "delivery-service", context);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await logAuditEntry({
      actor,
      action: "delivery.merge",
      resource: branch,
      decision: "deny",
      result: reason.slice(0, 500),
    });
    // Leave the repository on the base branch with no half-finished merge state.
    await execGit(["merge", "--abort"], repoPath, "delivery-service").catch(() => undefined);
    return { merged: false, reason: `Merge failed: ${reason}` };
  }

  await logAuditEntry({
    actor,
    action: "delivery.merge",
    resource: branch,
    decision: "allow",
    result: `Merged into ${base}`,
  });

  return { merged: true, reason: `Merged ${branch} into ${base}` };
}
