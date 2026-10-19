/**
 * Coding Runtime Adapter Registry — manages multiple coding tool adapters.
 *
 * Push/PR operations are high-risk and go through the OSCapabilityBroker.
 */

import type { CodingAgentAdapter, CodingTask, CodingRunInfo, CodingArtifact } from "./types.js";
import { ClaudeCodeCliAdapter } from "./adapters/claude-code/cli-adapter.js";
import { CodexCliAdapter } from "./adapters/codex/cli-adapter.js";
import { OpenCodeCliAdapter } from "./adapters/opencode/cli-adapter.js";
import { AcpCodingAdapter } from "./adapters/acp/adapter.js";
import { getCapabilityBroker } from "../../capabilities/os-capability-broker.js";
import type { ExecutorAdapter, ExecutorCapabilityProfile } from "@jarvis/runtime-protocol";
import { CodingExecutorAdapterWrapper } from "./executor-adapter-wrapper.js";

const adapters = new Map<string, CodingAgentAdapter>();
const executorAdapters = new Map<string, ExecutorAdapter>();

export interface ExecutorSelection {
  adapterId: string;
  routeReason: string;
}

/**
 * A capability the caller depends on. Adapters that cannot honour it are
 * skipped rather than silently used with weaker guarantees.
 */
export interface ExecutorRequirements {
  /** Executor must be able to interrupt a running task. */
  requiresCancellation?: boolean;
  /** Executor must stream structured events. */
  requiresStructuredEvents?: boolean;
  /**
   * Executor must intercept tool calls and route them through approval.
   * CLI adapters cannot (nativeToolApprovalIntercepted: false), so requesting
   * this excludes them instead of pretending approval is enforced.
   */
  requiresToolLevelApproval?: boolean;
  /** Executor must be resumable from a prior session. */
  requiresResumableSession?: boolean;
}

export interface ExecutorSelectionDetail extends ExecutorSelection {
  capabilities: ExecutorCapabilityProfile;
}

/** Register built-in adapters */
function registerDefaults(): void {
  if (!adapters.has("claude-code")) {
    adapters.set("claude-code", new ClaudeCodeCliAdapter());
  }
  if (!adapters.has("codex")) {
    adapters.set("codex", new CodexCliAdapter());
  }
  if (!adapters.has("opencode")) {
    adapters.set("opencode", new OpenCodeCliAdapter());
  }
  if (!adapters.has("acp")) {
    adapters.set("acp", new AcpCodingAdapter());
  }
}

/**
 * Get a registered coding runtime adapter by ID.
 */
export function getCodingRuntime(adapterId: string): CodingAgentAdapter | undefined {
  registerDefaults();
  return adapters.get(adapterId);
}

export function getExecutorAdapter(adapterId: string): ExecutorAdapter | undefined {
  const existing = executorAdapters.get(adapterId);
  if (existing) return existing;
  const adapter = getCodingRuntime(adapterId);
  if (!adapter) return undefined;
  const wrapped = new CodingExecutorAdapterWrapper(adapter);
  executorAdapters.set(adapterId, wrapped);
  return wrapped;
}

export function registerCodingRuntime(adapter: CodingAgentAdapter): void {
  adapters.set(adapter.id, adapter);
  executorAdapters.delete(adapter.id);
}

export async function selectExecutorAdapter(input: {
  preferredAdapterId?: string;
  permissionPolicy: "strict" | "normal" | "permissive";
  requireIsolation?: boolean;
  requirements?: ExecutorRequirements;
}): Promise<ExecutorSelection> {
  const { selection } = await selectExecutorAdapterDetailed(input);
  return selection;
}

/**
 * Select an executor and report the capabilities the caller actually gets.
 *
 * A unified UI must not imply every executor offers the same control. Callers
 * that surface runs to users should use this form and display the capability
 * profile rather than assuming approval, cancellation or cost are uniform.
 */
export async function selectExecutorAdapterDetailed(input: {
  preferredAdapterId?: string;
  permissionPolicy: "strict" | "normal" | "permissive";
  requireIsolation?: boolean;
  requirements?: ExecutorRequirements;
}): Promise<{ selection: ExecutorSelectionDetail }> {
  registerDefaults();
  const registeredIds = Array.from(adapters.keys()).sort();
  const candidates = input.preferredAdapterId
    ? [input.preferredAdapterId, ...registeredIds.filter((id) => id !== input.preferredAdapterId)]
    : registeredIds;
  const reasons: string[] = [];
  const requirements = input.requirements ?? {};

  for (const adapterId of candidates) {
    if (adapterId === "self") continue;
    const adapter = getExecutorAdapter(adapterId);
    if (!adapter) {
      reasons.push(`${adapterId}: not registered`);
      continue;
    }
    const capabilities = adapter.getCapabilities();
    if (capabilities.domain !== "coding") continue;
    if (input.requireIsolation && !capabilities.isolatedEnvironment) {
      reasons.push(`${adapterId}: no isolated environment`);
      continue;
    }
    if (!capabilities.permissionMode) {
      reasons.push(`${adapterId}: cannot project permission policy`);
      continue;
    }
    if (requirements.requiresCancellation && !capabilities.cancellation) {
      reasons.push(`${adapterId}: cannot cancel a running task`);
      continue;
    }
    if (requirements.requiresStructuredEvents && !capabilities.streamEvents) {
      reasons.push(`${adapterId}: no structured event stream`);
      continue;
    }
    if (requirements.requiresResumableSession && !capabilities.resumableSession) {
      reasons.push(`${adapterId}: sessions cannot be resumed`);
      continue;
    }
    if (
      requirements.requiresToolLevelApproval &&
      capabilities.metadata?.nativeToolApprovalIntercepted !== true
    ) {
      // A CLI wraps the vendor's own tool loop; approvals can only be inferred
      // from output, never enforced per tool call.
      reasons.push(`${adapterId}: tool-level approval cannot be enforced`);
      continue;
    }
    const availability = await adapter.discover();
    if (!availability.available) {
      reasons.push(`${adapterId}: ${availability.reason ?? "unavailable"}`);
      continue;
    }
    const preference = adapterId === input.preferredAdapterId ? "explicit preference" : "deterministic fallback";
    return {
      selection: {
        adapterId,
        routeReason: `${preference}; coding domain; ${input.permissionPolicy} permission projection; ${availability.transport}`,
        capabilities,
      },
    };
  }
  throw new Error(`No eligible coding executor: ${reasons.join("; ")}`);
}

/**
 * List all registered coding runtime adapters.
 */
export function listCodingRuntimes(): Array<{ id: string; name: string }> {
  registerDefaults();
  return Array.from(adapters.values()).map((a) => ({ id: a.id, name: a.displayName }));
}

/**
 * Create a coding run using the specified adapter.
 */
export async function createCodingRun(
  adapterId: string,
  task: CodingTask,
): Promise<CodingRunInfo> {
  const adapter = getCodingRuntime(adapterId);
  if (!adapter) throw new Error(`Unknown coding runtime: ${adapterId}`);

  const handle = await adapter.startRun(task);

  // Return full CodingRunInfo by querying the adapter
  return adapter.getRunStatus(handle.runId);
}

/**
 * Collect artifacts from a coding run.
 */
export async function collectCodingArtifacts(
  adapterId: string,
  runId: string,
): Promise<CodingArtifact[]> {
  const adapter = getCodingRuntime(adapterId);
  if (!adapter) throw new Error(`Unknown coding runtime: ${adapterId}`);
  return adapter.collectArtifacts(runId);
}

/**
 * Request a git push — high-risk, requires approval via OSCapabilityBroker.
 */
export async function requestGitPush(
  actorId: string,
  repoPath: string,
  branch: string,
  opts?: { agentRunId?: string; taskId?: string; projectId?: string },
): Promise<{ allowed: boolean; reason: string }> {
  const broker = getCapabilityBroker();
  const decision = await broker.requestShellExec(
    actorId,
    `git push origin ${branch}`,
    {
      reason: `Push to ${repoPath} branch ${branch}`,
      ...opts,
    },
  );

  return {
    allowed: decision.decision === "allow",
    reason: decision.reason,
  };
}

/**
 * Request a PR creation — high-risk, requires approval via OSCapabilityBroker.
 */
export async function requestPRCreation(
  actorId: string,
  repoPath: string,
  title: string,
  opts?: { agentRunId?: string; taskId?: string; projectId?: string },
): Promise<{ allowed: boolean; reason: string }> {
  const broker = getCapabilityBroker();
  const decision = await broker.requestShellExec(
    actorId,
    `gh pr create --title "${title}"`,
    {
      reason: `Create PR in ${repoPath}: ${title}`,
      ...opts,
    },
  );

  return {
    allowed: decision.decision === "allow",
    reason: decision.reason,
  };
}
