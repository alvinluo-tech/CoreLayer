/**
 * Hardline Blocklist — unconditionally blocked operations.
 *
 * These operations are ALWAYS denied, even if the user has auto-approved
 * similar tools. They represent catastrophic risk that no approval flow
 * should allow.
 *
 * Unlike the permission guard (which gates on risk level and user approval),
 * the hardline blocklist is a safety net that cannot be bypassed.
 */

export interface BlocklistRule {
  /** Pattern to match against (case-insensitive for shell commands) */
  pattern: string;
  /** Human-readable description of why this is blocked */
  reason: string;
  /** Tool categories this applies to */
  categories: string[];
}

/** Shell commands that are unconditionally blocked */
export const HARDCODE_SHELL_BLOCKLIST: BlocklistRule[] = [
  { pattern: "rm -rf /", reason: "Recursive delete of root filesystem", categories: ["shell"] },
  { pattern: "rm -rf /*", reason: "Recursive delete of all files", categories: ["shell"] },
  { pattern: "rm -rf ~", reason: "Recursive delete of home directory", categories: ["shell"] },
  { pattern: "mkfs", reason: "Format filesystem", categories: ["shell"] },
  { pattern: "dd of=/dev/", reason: "Write to block device", categories: ["shell"] },
  { pattern: ":(){ :|:& };:", reason: "Fork bomb", categories: ["shell"] },
  { pattern: "kill -9 -1", reason: "Kill all processes", categories: ["shell"] },
  { pattern: "shutdown", reason: "System shutdown without explicit permission", categories: ["shell"] },
  { pattern: "reboot", reason: "System reboot without explicit permission", categories: ["shell"] },
  { pattern: "curl", reason: "Pipe remote content to shell", categories: ["shell"] },
  { pattern: "wget", reason: "Pipe remote content to shell", categories: ["shell"] },
  { pattern: "chmod -R 777", reason: "Recursive permission grant to all users", categories: ["shell"] },
];

/** File operations that are unconditionally blocked */
export const HARDCODE_FILE_BLOCKLIST: BlocklistRule[] = [
  { pattern: "DELETE_ROOT", reason: "Delete root directory", categories: ["file"] },
  { pattern: "DELETE_HOME", reason: "Delete home directory", categories: ["file"] },
  { pattern: "DELETE_WORKSPACE", reason: "Delete entire workspace without explicit preview", categories: ["file"] },
];

/** Git operations that are unconditionally blocked */
export const HARDCODE_GIT_BLOCKLIST: BlocklistRule[] = [
  { pattern: "push --force", reason: "Force push to remote", categories: ["git"] },
  { pattern: "push -f", reason: "Force push to remote", categories: ["git"] },
  { pattern: "reset --hard", reason: "Hard reset discards uncommitted changes", categories: ["git"] },
  { pattern: "clean -fdx", reason: "Remove untracked files and directories", categories: ["git"] },
];

/** All blocklist rules combined */
export const ALL_BLOCKLIST_RULES: BlocklistRule[] = [
  ...HARDCODE_SHELL_BLOCKLIST,
  ...HARDCODE_FILE_BLOCKLIST,
  ...HARDCODE_GIT_BLOCKLIST,
];

export type BlocklistResult =
  | { blocked: false }
  | { blocked: true; rule: BlocklistRule };

/**
 * Check if a command or operation matches any hardline blocklist rule.
 * Returns the first matching rule, or null if no match.
 */
export function checkHardlineBlocklist(
  input: string,
  category?: string,
): BlocklistResult {
  const normalized = input.trim().toLowerCase();
  const rules = category
    ? ALL_BLOCKLIST_RULES.filter((r) => r.categories.includes(category))
    : ALL_BLOCKLIST_RULES;

  for (const rule of rules) {
    if (normalized.includes(rule.pattern.toLowerCase())) {
      return { blocked: true, rule };
    }
  }

  return { blocked: false };
}
