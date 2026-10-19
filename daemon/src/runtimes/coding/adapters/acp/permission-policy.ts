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
 * - normal: approve reads/searches, approve edits and commands (the run is
 *   already isolated in a dedicated worktree and branch)
 * - strict: approve reads, escalate anything that mutates or executes
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

  if (policy === "strict" && (WRITE_KINDS.has(kind) || !READ_KINDS.has(kind))) {
    return {
      action: "escalate",
      reason: `Strict policy: '${request.title ?? request.toolCallId ?? "tool"}' (${kind}) needs explicit approval`,
    };
  }

  if (READ_KINDS.has(kind) || WRITE_KINDS.has(kind)) {
    return approveOrEscalate(allowOption, kind);
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
 * layers must agree. Strict runs escalate writes to this adapter rather than
 * letting acpx fail the session.
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
  return { defaultAction: "approve" };
}
