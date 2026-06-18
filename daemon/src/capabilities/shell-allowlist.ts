/**
 * Shell command allowlist.
 *
 * Commands matching these patterns are allowed with approval (not auto-denied).
 * Commands not matching any pattern are treated as critical risk.
 */

import type { ShellAllowlistRule } from "./types.js";

/** Default shell allowlist — safe, read-only, or common dev commands */
export const DEFAULT_SHELL_ALLOWLIST: ShellAllowlistRule[] = [
  { pattern: "git status", description: "Check git status", riskOverride: "low" },
  { pattern: "git log", description: "View git log", riskOverride: "low" },
  { pattern: "git diff", description: "View git diff", riskOverride: "low" },
  { pattern: "git branch", description: "List git branches", riskOverride: "low" },
  { pattern: "git show", description: "Show git object", riskOverride: "low" },
  { pattern: "git worktree ", description: "Manage git worktrees", riskOverride: "low" },
  { pattern: "git clone ", description: "Clone repository", riskOverride: "medium" },
  { pattern: "git init", description: "Initialize repository", riskOverride: "low" },
  { pattern: "git add ", description: "Stage changes", riskOverride: "low" },
  { pattern: "git commit ", description: "Commit changes", riskOverride: "low" },
  { pattern: "claude ", description: "Claude Code CLI", riskOverride: "low" },
  { pattern: "codex ", description: "Codex CLI", riskOverride: "low" },
  { pattern: "opencode ", description: "OpenCode CLI", riskOverride: "low" },
  { pattern: "ls ", description: "List directory contents", riskOverride: "low" },
  { pattern: "dir ", description: "List directory contents (Windows)", riskOverride: "low" },
  { pattern: "cat ", description: "Read file contents", riskOverride: "low" },
  { pattern: "head ", description: "Read first lines of file", riskOverride: "low" },
  { pattern: "tail ", description: "Read last lines of file", riskOverride: "low" },
  { pattern: "wc ", description: "Word count", riskOverride: "low" },
  { pattern: "find ", description: "Find files", riskOverride: "medium" },
  { pattern: "grep ", description: "Search file contents", riskOverride: "low" },
  { pattern: "pnpm ", description: "pnpm package manager", riskOverride: "medium" },
  { pattern: "npm ", description: "npm package manager", riskOverride: "medium" },
  { pattern: "node ", description: "Run Node.js script", riskOverride: "medium" },
  { pattern: "npx ", description: "Run npm package binary", riskOverride: "medium" },
  { pattern: "python ", description: "Run Python script", riskOverride: "medium" },
  { pattern: "pip ", description: "Python package manager", riskOverride: "medium" },
  { pattern: "cargo ", description: "Rust package manager", riskOverride: "medium" },
];

/**
 * Check if a command matches any allowlist rule.
 * Returns the matched rule or undefined.
 */
export function matchAllowlist(
  command: string,
  allowlist: ShellAllowlistRule[] = DEFAULT_SHELL_ALLOWLIST,
): ShellAllowlistRule | undefined {
  const trimmed = command.trim();
  return allowlist.find((rule) => trimmed.startsWith(rule.pattern));
}
