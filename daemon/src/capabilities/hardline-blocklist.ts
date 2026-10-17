/**
 * Hardline Blocklist & Unified Risk Policy — single source of truth for
 * command-level risk decisions.
 *
 * Risk rules evaluate the STRUCTURED parse of a command (binary, args, pipe
 * topology) produced by the shell tokenizer — never raw substring matching.
 * This closes both directions of the old `includes("curl")` failure mode:
 * false positives (blocking `grep curl README.md`) and obfuscation bypasses
 * (`cu"rl" … | ba"sh"`, `cu\rl … | bash`, `FOO=1 rm -rf /`).
 *
 * Consumers:
 * - execute-tool.ts (tool execution gate) via checkHardlineBlocklist()
 * - policy-engine.ts (RuntimeAction evaluation) via assessShellRisk()
 */

import {
  parseShellCommand,
  type ParsedShellCommand,
  type ShellSegment,
} from "./shell-tokenizer.js";

/** Declarative catalog entry (kept for consumers and diagnostics). */
export interface BlocklistRule {
  /** Human-readable description of what the structured matcher covers. */
  pattern: string;
  /** Human-readable description of why this is blocked. */
  reason: string;
  /** Tool categories this applies to. */
  categories: string[];
}

export type ShellRiskLevel = "critical" | "high" | "none";

export interface ShellRiskAssessment {
  risk: ShellRiskLevel;
  ruleId?: string;
  reason?: string;
}

/** Interpreters that execute a program streamed over stdin. */
const SHELL_INTERPRETERS = new Set([
  "sh", "bash", "zsh", "dash", "ksh", "fish", "powershell", "pwsh", "cmd", "iex",
]);

/** Language runtimes that read the PROGRAM from stdin when no script is given. */
const STDIN_EXECUTORS = new Set(["node", "python", "python3", "perl", "ruby"]);

/** Privilege wrappers that may shield an interpreter as the pipe target. */
const PRIVILEGE_WRAPPERS = new Set(["sudo", "doas"]);

/** Raw fallback for pipes hidden inside an interpreter's -Command string. */
const POWERSHELL_INJECTION_PATTERN =
  /\b(iwr|invoke-webrequest|invoke-restmethod|curl|wget|curl\.exe)\b[\s\S]*[|;]\s*(iex|invoke-expression)\b/i;

/** Expand short flags (-abc → a,b,c) and collect long flags into a set. */
function collectFlags(args: string[]): Set<string> {
  const flags = new Set<string>();
  for (const arg of args) {
    if (arg === "--") break;
    if (arg.startsWith("--")) {
      flags.add(arg);
    } else if (/^-[A-Za-z]/.test(arg)) {
      for (const ch of arg.slice(1)) flags.add(ch);
    }
  }
  return flags;
}

/** True when the argument targets a filesystem root or the user's home. */
function isRootLikeTarget(arg: string): boolean {
  if (arg === "/" || arg === "/*" || arg === "~" || arg === "~/*") return true;
  if (arg === "$HOME" || arg.startsWith("$HOME/")) return true;
  if (arg === "${HOME}" || arg.startsWith("${HOME}/")) return true;
  // Windows drive roots: C: , C:\ , C:/ , C:\* … (a trailing bare backslash is
  // eaten as an escape by the tokenizer, so accept the bare drive too).
  if (/^[a-z]:$/i.test(arg)) return true;
  if (/^[a-z]:[\\/](\*)?$/i.test(arg)) return true;
  return false;
}

function isInterpreterSegment(segment: ShellSegment): boolean {
  if (SHELL_INTERPRETERS.has(segment.binary)) return true;
  if (PRIVILEGE_WRAPPERS.has(segment.binary)) {
    const target = segment.args.find((arg) => !arg.startsWith("-"));
    if (target && SHELL_INTERPRETERS.has(target.toLowerCase())) return true;
  }
  return false;
}

function readsProgramFromStdin(segment: ShellSegment): boolean {
  if (!STDIN_EXECUTORS.has(segment.binary)) return false;
  const positional = segment.args.filter((arg) => !arg.startsWith("-"));
  // `python` / `python -` with no script file executes the stdin stream.
  return positional.length === 0 || positional.includes("-");
}

interface StructuredRiskRule {
  id: string;
  reason: string;
  category: "shell" | "file" | "git";
  risk: ShellRiskLevel;
  match: (parsed: ParsedShellCommand, raw: string) => boolean;
}

/**
 * The unified risk matrix. Every deterministic command-level judgment lives
 * here — policy-engine and the tool gate must not grow their own copies.
 */
const RISK_RULES: StructuredRiskRule[] = [
  {
    id: "pipe-to-interpreter",
    reason: "Piping downloadable content into a shell interpreter (remote code injection)",
    category: "shell",
    risk: "critical",
    match: (parsed, raw) => {
      if (parsed.hasPipe) {
        for (const segment of parsed.segments.slice(1)) {
          if (isInterpreterSegment(segment)) return true;
          if (readsProgramFromStdin(segment)) return true;
        }
      }
      // First stage piping via stdin redirect: `curl x | sh` variants covered
      // above; `curl x -o - | bash` too. Hidden pipes inside powershell -Command:
      if (POWERSHELL_INJECTION_PATTERN.test(raw)) return true;
      return false;
    },
  },
  {
    id: "rm-recursive-root",
    reason: "Recursive delete of root filesystem",
    category: "shell",
    risk: "critical",
    match: (parsed) => {
      if (parsed.binary !== "rm") return false;
      const flags = collectFlags(parsed.args);
      const recursive = flags.has("r") || flags.has("R") || flags.has("--recursive");
      const forced = flags.has("f") || flags.has("--force");
      if (!recursive) return false;
      for (const arg of parsed.args) {
        if (arg.startsWith("-")) continue;
        if (isRootLikeTarget(arg)) return true;
        // rm -rf /<anything> — preserve the legacy absolute-path guard.
        if (forced && arg.startsWith("/")) return true;
        if (forced && /^[a-z]:[\\/]/i.test(arg)) return true;
      }
      return false;
    },
  },
  {
    id: "mkfs",
    reason: "Format filesystem",
    category: "shell",
    risk: "critical",
    match: (parsed) => parsed.binary.startsWith("mkfs") || parsed.binary === "format",
  },
  {
    id: "dd-to-device",
    reason: "Raw write to a block device",
    category: "shell",
    risk: "critical",
    match: (parsed, raw) =>
      parsed.binary === "dd" &&
      (parsed.args.some((arg) => /^of=(\/dev\/|\\+\.)/.test(arg)) ||
        // Raw check catches windows device paths whose backslashes get
        // partially unfolded by the tokenizer: of=\\.\PhysicalDrive0
        /of=\\+\./i.test(raw)),
  },
  {
    id: "fork-bomb",
    reason: "Fork bomb",
    category: "shell",
    risk: "critical",
    match: (_parsed, raw) => raw.replace(/\s+/g, "") === ":(){:|:&};:",
  },
  {
    id: "kill-all-processes",
    reason: "Kill all processes",
    category: "shell",
    risk: "critical",
    match: (parsed) => {
      if (parsed.binary !== "kill") return false;
      // -9 / -1 are numeric signals, not letter flags — match them literally.
      const forceful = parsed.args.includes("-9") || parsed.args.includes("-KILL");
      return forceful && parsed.args.includes("-1");
    },
  },
  {
    id: "system-power-control",
    reason: "System shutdown without explicit permission",
    category: "shell",
    risk: "critical",
    match: (parsed) =>
      ["shutdown", "reboot", "halt", "poweroff"].includes(parsed.binary),
  },
  {
    id: "chmod-world-writable-recursive",
    reason: "Recursive permission grant to all users",
    category: "shell",
    risk: "critical",
    match: (parsed) => {
      if (parsed.binary !== "chmod") return false;
      const flags = collectFlags(parsed.args);
      const recursive = flags.has("R") || flags.has("--recursive");
      return recursive && parsed.args.includes("777");
    },
  },
  {
    id: "git-push-force",
    reason: "Force push to remote",
    category: "git",
    risk: "critical",
    match: (parsed) => {
      if (parsed.binary !== "git" || parsed.args[0] !== "push") return false;
      // --force-with-lease is the guarded variant and stays allowed.
      const flags = collectFlags(parsed.args.slice(1));
      return flags.has("f") || flags.has("--force");
    },
  },
  {
    id: "git-reset-hard",
    reason: "Hard reset discards uncommitted changes",
    category: "git",
    risk: "critical",
    match: (parsed) =>
      parsed.binary === "git" &&
      parsed.args[0] === "reset" &&
      collectFlags(parsed.args.slice(1)).has("--hard"),
  },
  {
    id: "git-clean-aggressive",
    reason: "Remove untracked files and directories",
    category: "git",
    risk: "critical",
    match: (parsed) => {
      if (parsed.binary !== "git" || parsed.args[0] !== "clean") return false;
      const flags = collectFlags(parsed.args.slice(1));
      return flags.has("f") && flags.has("d") && flags.has("x");
    },
  },
  {
    id: "unparsable-command",
    reason: "Command could not be parsed safely (malformed quoting)",
    category: "shell",
    risk: "critical",
    match: (parsed) => !!parsed.parseError,
  },
  {
    id: "file-root-delete-sentinel",
    reason: "Delete root directory",
    category: "file",
    risk: "critical",
    match: (_parsed, raw) => raw.includes("DELETE_ROOT"),
  },
  {
    id: "file-home-delete-sentinel",
    reason: "Delete home directory",
    category: "file",
    risk: "critical",
    match: (_parsed, raw) => raw.includes("DELETE_HOME"),
  },
  {
    id: "file-workspace-delete-sentinel",
    reason: "Delete entire workspace without explicit preview",
    category: "file",
    risk: "critical",
    match: (_parsed, raw) => raw.includes("DELETE_WORKSPACE"),
  },
];

const RULE_CATALOG: Record<string, BlocklistRule> = Object.fromEntries(
  RISK_RULES.map((rule) => [
    rule.id,
    {
      pattern: rule.id,
      reason: rule.reason,
      categories: [rule.category],
    },
  ]),
);

/** Declarative catalog — every structured rule, grouped for consumers. */
export const ALL_BLOCKLIST_RULES: BlocklistRule[] = RISK_RULES.map((rule) => RULE_CATALOG[rule.id]);

export const HARDCODE_SHELL_BLOCKLIST: BlocklistRule[] = ALL_BLOCKLIST_RULES.filter((rule) =>
  rule.categories.includes("shell"),
);
export const HARDCODE_GIT_BLOCKLIST: BlocklistRule[] = ALL_BLOCKLIST_RULES.filter((rule) =>
  rule.categories.includes("git"),
);
export const HARDCODE_FILE_BLOCKLIST: BlocklistRule[] = ALL_BLOCKLIST_RULES.filter((rule) =>
  rule.categories.includes("file"),
);

/**
 * Structured risk assessment for a raw command string.
 * Returns the first matching critical/high rule, or risk "none".
 */
export function assessShellRisk(rawCommand: string): ShellRiskAssessment {
  const raw = (rawCommand ?? "").trim();
  if (!raw) return { risk: "none" };
  const parsed = parseShellCommand(raw);
  for (const rule of RISK_RULES) {
    if (rule.match(parsed, raw)) {
      return { risk: rule.risk, ruleId: rule.id, reason: rule.reason };
    }
  }
  return { risk: "none" };
}

export type BlocklistResult =
  | { blocked: false }
  | { blocked: true; rule: BlocklistRule };

/**
 * Check if a command or operation matches any hardline blocklist rule.
 * Structured matching over the parsed command; category filters which rule
 * families apply (shell / git / file).
 */
export function checkHardlineBlocklist(
  input: string,
  category?: string,
): BlocklistResult {
  const assessment = assessShellRisk(input);
  if (assessment.risk === "none" || !assessment.ruleId) {
    return { blocked: false };
  }
  const rule = RULE_CATALOG[assessment.ruleId];
  if (category && !rule.categories.includes(category)) {
    return { blocked: false };
  }
  return { blocked: true, rule };
}
