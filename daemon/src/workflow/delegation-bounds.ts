/**
 * Delegation bounds — what a caller is allowed to ask a child run to do.
 *
 * A delegated run is not a second opinion: it executes code, writes files, and
 * spends budget. The caller that dispatches it is often an agent, so the bounds
 * it proposes cannot be trusted to be at least as strict as its own. The rule
 * this module enforces is therefore one direction only — a delegation may
 * **narrow** what the caller could do, never widen it.
 *
 * Pure functions with no persistence or process access, so the rule can be
 * tested exhaustively instead of inferred from an integration run.
 */

export interface DelegationBounds {
  /**
   * Glob patterns a child may modify. Empty means "no path policy"; once any
   * level of the chain declares paths, every child is confined to them.
   */
  allowedPaths: string[];
  /** Commands the child's work must pass. A child cannot drop a parent check. */
  testCommands: string[];
  /** Artifact types the child must produce. */
  requiredArtifactTypes: string[];
  /** Wall-clock budget for the child run. */
  timeoutMs: number;
  /** Executor tool names the child may use. Empty means "the parent's set". */
  allowedTools: string[];
  /** Model the child must run, when the caller pins one. */
  executorModel?: string;
  /** Executor adapter the child must use, when the caller pins one. */
  executor?: string;
}

export interface DelegationRequest {
  task: string;
  allowedPaths?: string[];
  testCommands?: string[];
  requiredArtifactTypes?: string[];
  timeoutMs?: number;
  allowedTools?: string[];
  executorModel?: string;
  executor?: string;
}

export const MIN_DELEGATION_TIMEOUT_MS = 30_000;
export const MAX_DELEGATION_TIMEOUT_MS = 30 * 60_000;
/** Prompt bytes a parent may hand one child. Beyond this the child is not a task. */
export const MAX_DELEGATION_PROMPT_CHARS = 8_000;

export class DelegationRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DelegationRejected";
  }
}

/**
 * Merge a child's requested bounds with its parent's.
 *
 * `parent` is what the calling run itself may do; `request` is what it asked
 * for the child. The result is never wider than `parent`.
 */
export function narrowDelegationBounds(
  parent: DelegationBounds,
  request: DelegationRequest,
): DelegationBounds {
  return {
    allowedPaths: narrowPaths(parent.allowedPaths, request.allowedPaths),
    // Checks are additive: a parent that requires `npm test` cannot have that
    // requirement dropped by a child that names only its own command.
    testCommands: unique([...parent.testCommands, ...(request.testCommands ?? [])]),
    requiredArtifactTypes: unique([
      ...parent.requiredArtifactTypes,
      ...(request.requiredArtifactTypes ?? []),
    ]),
    // Budget shrinks toward whichever ceiling is lower.
    timeoutMs: Math.max(
      MIN_DELEGATION_TIMEOUT_MS,
      Math.min(
        request.timeoutMs ?? parent.timeoutMs,
        parent.timeoutMs,
        MAX_DELEGATION_TIMEOUT_MS,
      ),
    ),
    // Tools intersect: a child may use fewer tools, never one the parent lacks.
    allowedTools: narrowTools(parent.allowedTools, request.allowedTools),
    ...pinExecutor(parent, request),
  };
}

/**
 * The initial bounds for a top-level run.
 *
 * These come from the task and agent profile, i.e. from the user, so they are
 * the ceiling for everything downstream.
 */
export function rootDelegationBounds(input: Partial<DelegationBounds> = {}): DelegationBounds {
  return {
    allowedPaths: unique(input.allowedPaths ?? []),
    testCommands: unique(input.testCommands ?? []),
    requiredArtifactTypes: unique(input.requiredArtifactTypes ?? []),
    timeoutMs: clampTimeout(input.timeoutMs ?? MAX_DELEGATION_TIMEOUT_MS),
    allowedTools: unique(input.allowedTools ?? []),
    ...(input.executorModel ? { executorModel: input.executorModel } : {}),
    ...(input.executor ? { executor: input.executor } : {}),
  };
}

/**
 * Validate a delegation before it becomes a run.
 *
 * Rejection here is the cheap point: after this the request has a queue entry,
 * a worktree and a process, and undoing it costs far more than refusing it.
 */
export function validateDelegationRequest(
  request: DelegationRequest,
  parent: DelegationBounds,
): void {
  const task = request.task?.trim() ?? "";
  if (!task) throw new DelegationRejected("A delegation needs a task description");
  if (task.length > MAX_DELEGATION_PROMPT_CHARS) {
    throw new DelegationRejected(
      `Delegated task is ${task.length} characters; the limit is ${MAX_DELEGATION_PROMPT_CHARS}. ` +
        "A delegation should name one job, not carry a document.",
    );
  }
  if (request.timeoutMs !== undefined && !Number.isFinite(request.timeoutMs)) {
    throw new DelegationRejected("timeoutMs must be a number of milliseconds");
  }
  if (request.executor && parent.executor && request.executor !== parent.executor) {
    throw new DelegationRejected(
      `Child requested executor '${request.executor}' but the parent is bound to '${parent.executor}'; ` +
        "a delegation may not switch executor",
    );
  }
  if (
    request.executorModel &&
    parent.executorModel &&
    request.executorModel !== parent.executorModel
  ) {
    throw new DelegationRejected(
      `Child requested model '${request.executorModel}' but the parent is bound to '${parent.executorModel}'; ` +
        "a delegation may not switch model",
    );
  }
  const escaped = escapeAttempts(request.allowedPaths ?? []);
  if (escaped.length > 0) {
    throw new DelegationRejected(
      `allowedPaths must stay inside the repository; rejected: ${escaped.join(", ")}`,
    );
  }
}

/**
 * Paths a delegation cannot name at all.
 *
 * A path that leaves the repository is not "narrower" than the parent's scope,
 * so it is rejected outright rather than silently intersected to nothing.
 */
function escapeAttempts(patterns: readonly string[]): string[] {
  return patterns.filter(
    (pattern) =>
      pattern.trim().startsWith("/") ||
      /^[a-zA-Z]:/.test(pattern.trim()) ||
      pattern.split(/[\\/]/).some((segment) => segment === ".."),
  );
}

/**
 * Intersect the parent's path scope with the child's request.
 *
 * An empty parent scope means the parent was never confined, so the child's
 * request is the first confinement and stands. A child that names no paths
 * inherits the parent's scope unchanged.
 */
export function narrowPaths(parentPaths: string[], requested?: string[]): string[] {
  if (!requested || requested.length === 0) return unique(parentPaths);
  if (parentPaths.length === 0) return unique(requested);

  const intersection: string[] = [];
  for (const child of requested) {
    for (const parent of parentPaths) {
      const overlap = intersectGlobs(parent, child);
      if (overlap) intersection.push(overlap);
    }
  }
  if (intersection.length === 0) {
    throw new DelegationRejected(
      `Requested paths [${requested.join(", ")}] do not overlap the parent's scope ` +
        `[${parentPaths.join(", ")}]; a delegation cannot widen its parent's reach`,
    );
  }
  return unique(intersection);
}

function narrowTools(parentTools: string[], requested?: string[]): string[] {
  if (!requested || requested.length === 0) return unique(parentTools);
  if (parentTools.length === 0) return unique(requested);
  const allowed = new Set(parentTools);
  const granted = requested.filter((tool) => allowed.has(tool));
  if (granted.length === 0) {
    throw new DelegationRejected(
      `Requested tools [${requested.join(", ")}] are not in the parent's tool set; ` +
        "a delegation cannot grant a tool its parent does not hold",
    );
  }
  return unique(granted);
}

function pinExecutor(
  parent: DelegationBounds,
  request: DelegationRequest,
): Pick<DelegationBounds, "executor" | "executorModel"> {
  const executor = parent.executor ?? request.executor;
  const executorModel = parent.executorModel ?? request.executorModel;
  return {
    ...(executor ? { executor } : {}),
    ...(executorModel ? { executorModel } : {}),
  };
}

/**
 * The narrower of two globs, or null when they cannot both match.
 *
 * Supports the same syntax the path policy understands: `*`, `**`, `?`, and a
 * literal prefix. Segment-wise comparison is enough because the patterns are
 * path-shaped; a pattern this cannot reason about is treated as disjoint
 * rather than assumed compatible, so an unrecognised form fails closed.
 */
export function intersectGlobs(parent: string, child: string): string | null {
  const parentSegments = splitGlob(parent);
  const childSegments = splitGlob(child);

  const result: string[] = [];
  const limit = Math.min(parentSegments.length, childSegments.length);
  for (let index = 0; index < limit; index += 1) {
    const merged = intersectSegment(parentSegments[index], childSegments[index]);
    if (merged === null) return null;
    result.push(merged);
  }

  if (parentSegments.length === childSegments.length) return result.join("/");

  // One pattern reaches deeper than the other, and the deeper one is the
  // narrower: `**` already absorbed everything above the boundary, and a
  // literal or `*` segment only adds constraint. So its leftover segments are
  // the narrowed tail — including a trailing `**`, which means "everything
  // below here" and must survive.
  const deeper = parentSegments.length > childSegments.length ? parentSegments : childSegments;
  return [...result, ...deeper.slice(limit)].join("/");
}

function intersectSegment(parent: string, child: string): string | null {
  if (parent === "**") return child;
  if (child === "**") return parent;
  if (parent === child) return parent;
  if (parent === "*" || parent === "?") return child;
  if (child === "*" || child === "?") return parent;

  const parentWild = parent.includes("*") || parent.includes("?");
  const childWild = child.includes("*") || child.includes("?");

  if (parentWild && !childWild) return segmentMatches(child, parent) ? child : null;
  if (childWild && !parentWild) return segmentMatches(parent, child) ? parent : null;

  // Two wildcard segments. The narrower one is whichever matches a subset of
  // the other; when neither contains the other, the intersection is a pattern
  // neither of them is, and inventing that pattern is worse than refusing.
  if (segmentContains(parent, child)) return child;
  if (segmentContains(child, parent)) return parent;
  return null;
}

/**
 * True when every string `inner` matches is also matched by `outer`.
 *
 * Both patterns are a sequence of literal runs and `*`/`?` wildcards. Rather
 * than deriving an intersection pattern — which can be a shape neither input
 * is — containment is decided directly: walk `outer` and consume `inner` in
 * order, letting `*` swallow a range and `?` swallow one character. That is the
 * standard glob-containment test.
 */
function segmentContains(outer: string, inner: string): boolean {
  const wildcardState = (pattern: string): { star: boolean; question: number } => ({
    star: pattern.includes("*"),
    question: (pattern.match(/\?/g) ?? []).length,
  });
  // A literal-only outer pattern matches exactly one string, so containment
  // holds only if `inner` is that same literal.
  const outerWild = wildcardState(outer);
  const innerWild = wildcardState(inner);
  if (!outerWild.star && outerWild.question === 0) return inner === outer;
  if (!innerWild.star && innerWild.question === 0) {
    // `inner` is a literal; it is contained exactly when `outer` matches it.
    return segmentMatches(inner, outer);
  }
  // Both are patterns. Compare their literal skeleton: every literal run of
  // `outer` must appear in order inside `inner`, and `outer` must not require
  // more `?` characters than `inner` supplies.
  const outerLiterals = outer.split(/[*?]+/).filter(Boolean);
  let cursor = 0;
  for (const literal of outerLiterals) {
    const found = inner.indexOf(literal, cursor);
    if (found < 0) return false;
    cursor = found + literal.length;
  }
  return outerWild.question <= innerWild.question || innerWild.star;
}

function segmentMatches(literal: string, pattern: string): boolean {
  return segmentToRegex(pattern).test(literal);
}

function segmentToRegex(pattern: string): RegExp {
  const body = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");
  return new RegExp(`^${body}$`);
}

function splitGlob(pattern: string): string[] {
  return pattern.trim().replace(/\\/g, "/").split("/").filter(Boolean);
}

function clampTimeout(value: number): number {
  return Math.max(MIN_DELEGATION_TIMEOUT_MS, Math.min(value, MAX_DELEGATION_TIMEOUT_MS));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
