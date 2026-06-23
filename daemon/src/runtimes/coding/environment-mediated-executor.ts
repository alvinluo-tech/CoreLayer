/**
 * Environment-Mediated Executor — routes executor process lifecycle
 * through the ExecutionEnvironment instead of direct process spawning.
 *
 * This module wraps an existing CodingAgentAdapter so that:
 * - Process start goes through environment.executeCommand()
 * - Timeout is propagated through the environment
 * - Cancellation is propagated through the environment
 * - Logs are collected through the environment
 *
 * The low-level process spawn remains an internal implementation detail
 * of the environment backend (e.g., GitWorktreeEnvironment).
 */

import type { ExecutionEnvironment, EnvironmentSession } from "@jarvis/execution-environment";
import type { CodingAgentAdapter, CodingTask, CodingRunHandle, CodingRunInfo, CodingArtifact } from "./types.js";


interface MediatedRun {
  handle: CodingRunHandle;
  task: CodingTask;
  envSession: EnvironmentSession;
  status: CodingRunInfo["status"];
  startedAt: number;
  artifacts: CodingArtifact[];
  error?: string;
}

/** In-memory run store for mediated runs */
const mediatedRuns = new Map<string, MediatedRun>();

/**
 * Execute a coding task through an environment session.
 *
 * Instead of the adapter directly spawning a subprocess, this function:
 * 1. Uses the environment's executeCommand() to run the CLI
 * 2. Propagates timeout through the environment
 * 3. Collects logs and artifacts through the environment
 * 4. Returns a standard CodingRunHandle
 */
export async function executeThroughEnvironment(
  env: ExecutionEnvironment,
  adapter: CodingAgentAdapter,
  task: CodingTask,
  envSession: EnvironmentSession,
): Promise<CodingRunHandle> {
  const runId = task.dbRunId ?? crypto.randomUUID();
  const now = new Date().toISOString();

  const handle: CodingRunHandle = {
    runId,
    adapterId: adapter.id,
    status: "running",
    startedAt: now,
  };

  const mediatedRun: MediatedRun = {
    handle,
    task,
    envSession,
    status: "running",
    startedAt: Date.now(),
    artifacts: [],
  };

  mediatedRuns.set(runId, mediatedRun);

  // Execute asynchronously — the environment manages the process lifecycle
  executeInEnvironment(env, adapter, runId, task, envSession).catch(() => {});

  return handle;
}

/**
 * Get the current status of a mediated run.
 */
export function getMediatedRunStatus(runId: string): CodingRunInfo | null {
  const run = mediatedRuns.get(runId);
  if (!run) return null;

  return {
    runId,
    adapterId: run.handle.adapterId,
    status: run.status,
    task: run.task,
    startedAt: new Date(run.startedAt).toISOString(),
    completedAt: run.status !== "running" ? new Date().toISOString() : undefined,
    durationMs: run.status !== "running" ? Date.now() - run.startedAt : undefined,
    artifacts: run.artifacts,
    error: run.error,
  };
}

/**
 * Cancel a mediated run by disposing the environment session.
 */
export async function cancelMediatedRun(
  env: ExecutionEnvironment,
  runId: string,
): Promise<boolean> {
  const run = mediatedRuns.get(runId);
  if (!run || run.status !== "running") return false;

  run.status = "cancelled";
  run.error = "Cancelled by user";

  try {
    await env.dispose(run.envSession.id);
  } catch {
    // Best-effort cleanup
  }

  return true;
}

/**
 * Collect artifacts from a mediated run through the environment.
 */
export async function collectMediatedArtifacts(
  env: ExecutionEnvironment,
  runId: string,
): Promise<CodingArtifact[]> {
  const run = mediatedRuns.get(runId);
  if (!run) return [];

  try {
    const envArtifacts = await env.collectArtifacts(run.envSession.id);
    const codingArtifacts: CodingArtifact[] = envArtifacts.map((a) => ({
      type: a.kind as CodingArtifact["type"],
      content: a.content,
      metadata: a.metadata,
    }));
    run.artifacts = codingArtifacts;
    return codingArtifacts;
  } catch {
    return run.artifacts;
  }
}

/**
 * Internal: execute the adapter's CLI command through the environment.
 */
async function executeInEnvironment(
  env: ExecutionEnvironment,
  adapter: CodingAgentAdapter,
  runId: string,
  task: CodingTask,
  envSession: EnvironmentSession,
): Promise<void> {
  const run = mediatedRuns.get(runId);
  if (!run) return;

  try {
    // Build the CLI command from the adapter's task
    const command = buildCliCommand(adapter.id, task);

    // Execute through the environment — this routes through
    // the environment backend (git worktree, docker, etc.)
    const result = await env.executeCommand!(
      envSession.id,
      command,
      task.timeoutMs ?? 300_000,
    );

    if (result.exitCode === 0) {
      run.status = "succeeded";

      // Collect artifacts through the environment
      const envArtifacts = await env.collectArtifacts(envSession.id);
      run.artifacts = envArtifacts.map((a) => ({
        type: a.kind as CodingArtifact["type"],
        content: a.content,
        metadata: a.metadata,
      }));
    } else {
      run.status = "failed";
      run.error = result.stderr || `Process exited with code ${result.exitCode}`;
    }
  } catch (err) {
    run.status = "failed";
    run.error = err instanceof Error ? err.message : String(err);
  }
}

/**
 * Build a CLI command string for the given adapter.
 * This is coding-domain specific.
 */
function buildCliCommand(adapterId: string, task: CodingTask): string {
  const prompt = task.taskPrompt.replace(/"/g, '\\"');

  switch (adapterId) {
    case "claude-code":
      return `claude --print "${prompt}"`;
    case "codex":
      return `codex exec --sandbox workspace-write --color never "${prompt}"`;
    case "opencode":
      return `opencode --prompt "${prompt}"`;
    default:
      throw new Error(`Unknown adapter: ${adapterId}`);
  }
}
