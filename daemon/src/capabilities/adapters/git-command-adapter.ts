/**
 * Git command adapter — the ONLY way to execute git commands from daemon code.
 *
 * Enforces:
 * - Only `git` is allowed as the executable
 * - Arguments are passed as an array (no shell concatenation)
 * - cwd must be within an allowed directory (workspace root or repo path)
 * - All execution goes through the capability broker for permission checks
 */

import { execFileSync } from "node:child_process";
import { getCapabilityBroker } from "../os-capability-broker.js";

const ALLOWED_EXECUTABLE = "git";

/** Directories from which git execution is permitted. */
const allowedRoots: string[] = [];

/**
 * Register a directory as an allowed root for git execution.
 * Typically called with the repo path and workspace root at startup.
 */
export function allowGitRoot(dir: string): void {
  const normalized = dir.replace(/\\/g, "/").replace(/\/$/, "");
  if (!allowedRoots.includes(normalized)) {
    allowedRoots.push(normalized);
  }
}

/**
 * Validate that a cwd is within an allowed root directory.
 */
function validateCwd(cwd: string): void {
  const normalizedCwd = cwd.replace(/\\/g, "/").replace(/\/$/, "");
  const isAllowed = allowedRoots.some(
    (root) => normalizedCwd === root || normalizedCwd.startsWith(root + "/"),
  );
  if (!isAllowed) {
    throw new Error(
      `Git execution denied: cwd "${cwd}" is not within any allowed root. ` +
      `Allowed roots: [${allowedRoots.join(", ")}]`,
    );
  }
}

/**
 * Execute a git command with capability-broker permission checks.
 *
 * @param args - git subcommand and arguments (e.g. ["worktree", "add", ...])
 * @param cwd - working directory (must be within an allowed root)
 * @param actorId - identifier of the actor requesting execution
 * @param opts - optional context for the capability broker
 * @returns stdout output from the git command
 */
export async function execGit(
  args: string[],
  cwd: string,
  actorId: string,
  opts?: { agentRunId?: string; projectId?: string; reason?: string },
): Promise<string> {
  // Validate executable
  // args[0] is the git subcommand (worktree, diff, etc.) — we validate the
  // executable is always "git" by construction (execFileSync("git", args))
  // but also ensure no one passes "git" as the first arg
  if (args.length === 0) {
    throw new Error("Git command requires at least a subcommand");
  }

  // Validate cwd
  validateCwd(cwd);

  // Request permission through the capability broker
  const subcommand = args[0];
  const broker = getCapabilityBroker();
  const decision = await broker.requestShellExec(actorId, `git ${args.join(" ")}`, {
    reason: opts?.reason ?? `Git operation: ${subcommand}`,
    agentRunId: opts?.agentRunId,
    projectId: opts?.projectId,
  });

  if (decision.decision === "deny") {
    throw new Error(`Permission denied for git command: ${decision.reason}`);
  }

  if (decision.decision === "approval_required") {
    throw new Error(`Git command requires approval: git ${args.join(" ")}`);
  }

  // Execute with execFileSync — array args, no shell concatenation
  return execFileSync(ALLOWED_EXECUTABLE, args, {
    cwd,
    stdio: "pipe",
    encoding: "utf-8",
  });
}
