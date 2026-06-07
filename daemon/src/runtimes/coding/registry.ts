/**
 * Coding Runtime Registry — manages multiple coding tool adapters.
 *
 * Push/PR operations are high-risk and go through the OSCapabilityBroker.
 */

import type { CodingRuntime, CodingTask, CodingRunInfo, CodingArtifact } from "./types.js";
import { ClaudeCodeAdapter } from "./claude-code-adapter.js";
import { CodexAdapter } from "./codex-adapter.js";
import { getCapabilityBroker } from "../../capabilities/os-capability-broker.js";

const adapters = new Map<string, CodingRuntime>();

/** Register built-in adapters */
function registerDefaults(): void {
  if (!adapters.has("claude-code")) {
    adapters.set("claude-code", new ClaudeCodeAdapter());
  }
  if (!adapters.has("codex")) {
    adapters.set("codex", new CodexAdapter());
  }
}

/**
 * Get a registered coding runtime adapter by ID.
 */
export function getCodingRuntime(adapterId: string): CodingRuntime | undefined {
  registerDefaults();
  return adapters.get(adapterId);
}

/**
 * List all registered coding runtime adapters.
 */
export function listCodingRuntimes(): Array<{ id: string; name: string }> {
  registerDefaults();
  return Array.from(adapters.values()).map((a) => ({ id: a.id, name: a.name }));
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
  return adapter.createRun(task);
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
