/**
 * Decide how to answer ACP `session/request_permission` for a Jarvis run.
 *
 * ACP sessions have no TTY, so an unanswered prompt blocks the agent forever.
 * Every branch below therefore returns an explicit decision; "ask a human
 * later" is expressed by escalating the run, not by leaving the request
 * hanging.
 *
 * The read/write split follows ACP's `ToolKind` rather than the tool title.
 * Titles are model-authored prose, so substring matching on them (a title
 * mentioning "read" inside an edit) misclassifies operations that actually
 * mutate the workspace.
 */

export type CodingPermissionPolicy = "strict" | "normal" | "permissive";

export interface PermissionRequestView {
  toolCallId?: string;
  kind?: string;
  title?: string;
  rawInput?: unknown;
}

export interface PermissionOptionView {
  optionId: string;
  name?: string;
  kind?: string;
}

export type PermissionDecision =
  | { action: "approve"; optionId: string; reason: string }
  | { action: "deny"; optionId?: string; reason: string }
  | { action: "escalate"; reason: string };

const READ_KINDS = new Set(["read", "search", "fetch", "think"]);
const WRITE_KINDS = new Set(["edit", "delete", "move", "execute"]);

/**
 * Commands an unattended run may auto-approve beyond plain reads.
 *
 * A run with nobody watching cannot ask a human, so the choice is approve or
 * escalate (kill the run). Escalating on `ls` or `git status` makes the
 * executor unusable; approving `npm install` or `docker run` unattended hands
 * a model the network and the host. The list is deliberately small and
 * argument-aware; everything else escalates.
 */
const BENIGN_COMMAND_PATTERNS: ReadonlyArray<RegExp> = [
  /^(ls|dir|pwd|cat|head|tail|wc|file|stat|tree|which|where|echo)\b/i,
  /^git\s+(status|diff|log|show|branch|rev-parse|ls-files|describe)\b/i,
  /^(node|npm|pnpm|yarn|npx)\s+(-v|--version)\b/i,
  /^(python|python3|go|rustc|cargo|java)\s+(-V|--version|version)\b/i,
];

/** A shell call the policy cannot read as a plain command escalates. */
function commandIsBenign(rawInput: unknown): boolean {
  if (!rawInput || typeof rawInput !== "object") return false;
  const command = (rawInput as Record<string, unknown>).command;
  if (typeof command !== "string") return false;
  const trimmed = command.trim();
  // Compound commands, pipes, redirection and substitution can smuggle an
  // arbitrary second step past a prefix match.
  if (/[|;&<>$`\n]/.test(trimmed)) return false;
  return BENIGN_COMMAND_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Infer the ACP ToolKind.
 *
 * ACP lets an adapter omit `kind`, so the title's leading action word is used
 * as the fallback. Only the first word counts: an edit titled "read config then
 * write .env" must not be treated as a read.
 */
export function inferToolKind(request: PermissionRequestView): string {
  const kind = request.kind?.trim().toLowerCase();
  if (kind) return kind;

  const title = request.title?.trim() ?? "";
  const head = title.split(/[:\s—–-]/)[0]?.toLowerCase() ?? "";
  if (["read", "cat", "view", "open", "list", "ls", "grep", "find", "search", "fetch"].includes(head)) {
    return "read";
  }
  if (["write", "edit", "create", "patch", "apply", "delete", "remove", "move", "rename"].includes(head)) {
    return "edit";
  }
  if (["run", "exec", "execute", "bash", "shell", "command", "terminal"].includes(head)) {
    return "execute";
  }
  return "other";
}

/**
 * Resolve a permission request against the run's permission policy.
 *
 * - permissive: approve every request
 * - normal: approve reads/searches and benign shell commands; escalate writes
 *   and any command the policy cannot read (a worktree isolates the blast
 *   radius, but "nobody is watching" means mutating calls still need a human)
 * - strict: reads and benign shell commands only; everything else escalates
 */
export function resolvePermissionDecision(
  policy: CodingPermissionPolicy,
  request: PermissionRequestView,
  options: readonly PermissionOptionView[],
): PermissionDecision {
  const kind = inferToolKind(request);
  const allowOption = pickAllowOption(options);
  const rejectOption = pickRejectOption(options);

  if (policy === "permissive") {
    return approveOrEscalate(allowOption, kind);
  }

  if (READ_KINDS.has(kind)) {
    return approveOrEscalate(allowOption, kind);
  }

  if (kind === "execute" && commandIsBenign(request.rawInput)) {
    return approveOrEscalate(allowOption, kind);
  }

  if (policy === "strict") {
    return {
      action: "escalate",
      reason: `Strict policy: '${request.title ?? request.toolCallId ?? "tool"}' (${kind}) needs explicit approval`,
    };
  }

  // normal: writes and unreadable commands are exactly the class of action an
  // unattended run must not take on its own.
  if (WRITE_KINDS.has(kind)) {
    return {
      action: "escalate",
      reason: `Unattended run: '${request.title ?? request.toolCallId ?? "tool"}' (${kind}) needs explicit approval`,
    };
  }

  // Unknown kinds are not silently trusted. "other" covers tools whose effect
  // the adapter did not describe, so the safe answer is to refuse and surface it.
  if (rejectOption) {
    return {
      action: "deny",
      optionId: rejectOption.optionId,
      reason: `Unclassified tool '${request.title ?? request.toolCallId ?? "unknown"}' denied`,
    };
  }
  return {
    action: "escalate",
    reason: `Unclassified tool '${request.title ?? request.toolCallId ?? "unknown"}' has no deny option`,
  };
}

function approveOrEscalate(option: PermissionOptionView | undefined, kind: string): PermissionDecision {
  if (!option) {
    return { action: "escalate", reason: `Agent offered no allow option for ${kind} request` };
  }
  return { action: "approve", optionId: option.optionId, reason: `Auto-approved ${kind} request` };
}

function pickAllowOption(options: readonly PermissionOptionView[]): PermissionOptionView | undefined {
  return (
    options.find((o) => o.kind === "allow_once") ??
    options.find((o) => o.kind === "allow_always") ??
    options.find((o) => o.kind === "allow_session") ??
    options.find((o) => (o.optionId ?? "").toLowerCase().includes("allow"))
  );
}

function pickRejectOption(options: readonly PermissionOptionView[]): PermissionOptionView | undefined {
  return (
    options.find((o) => o.kind === "reject_once") ??
    options.find((o) => o.kind === "reject_always") ??
    options.find((o) => (o.optionId ?? "").toLowerCase().includes("reject") || (o.optionId ?? "").toLowerCase().includes("deny"))
  );
}

/**
 * Map the Jarvis permission policy onto acpx's `--permission-policy` JSON.
 *
 * acpx resolves requests itself before they reach the adapter, so the two
 * layers must agree: whatever this module would escalate must also be escalated
 * by acpx, or acpx would auto-approve a call this adapter refused to run.
 * Anything the policy does not classify falls through to `defaultAction`, which
 * is why it is never `approve` outside the permissive policy.
 */
export function toAcpxPermissionPolicy(policy: CodingPermissionPolicy): {
  autoApprove?: string[];
  autoDeny?: string[];
  escalate?: string[];
  defaultAction?: "approve" | "deny" | "escalate";
} {
  if (policy === "permissive") {
    return { defaultAction: "approve" };
  }
  if (policy === "strict") {
    return { autoApprove: ["read", "search", "fetch"], escalate: ["edit", "delete", "move", "execute"], defaultAction: "escalate" };
  }
  return { autoApprove: ["read", "search", "fetch"], defaultAction: "escalate" };
}
