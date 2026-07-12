/**
 * Coding Runtime Adapter Registry — manages multiple coding tool adapters.
 *
 * Push/PR operations are high-risk and go through the OSCapabilityBroker.
 */

import type { CodingAgentAdapter, CodingTask, CodingRunInfo, CodingArtifact } from "./types.js";
import { ClaudeCodeCliAdapter } from "./adapters/claude-code/cli-adapter.js";
import { CodexCliAdapter } from "./adapters/codex/cli-adapter.js";
import { OpenCodeCliAdapter } from "./adapters/opencode/cli-adapter.js";
import { getCapabilityBroker } from "../../capabilities/os-capability-broker.js";
import type { ExecutorAdapter } from "@jarvis/runtime-protocol";
import { CodingExecutorAdapterWrapper } from "./executor-adapter-wrapper.js";

const adapters = new Map<string, CodingAgentAdapter>();
const executorAdapters = new Map<string, ExecutorAdapter>();

export interface ExecutorSelection {
  adapterId: string;
  routeReason: string;
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
}): Promise<ExecutorSelection> {
  registerDefaults();
  const registeredIds = Array.from(adapters.keys()).sort();
  const candidates = input.preferredAdapterId
    ? [input.preferredAdapterId, ...registeredIds.filter((id) => id !== input.preferredAdapterId)]
    : registeredIds;
  const reasons: string[] = [];

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
    const availability = await adapter.discover();
    if (!availability.available) {
      reasons.push(`${adapterId}: ${availability.reason ?? "unavailable"}`);
      continue;
    }
    const preference = adapterId === input.preferredAdapterId ? "explicit preference" : "deterministic fallback";
    return {
      adapterId,
      routeReason: `${preference}; coding domain; ${input.permissionPolicy} permission projection; ${availability.transport}`,
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
