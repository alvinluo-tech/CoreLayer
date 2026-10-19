import type {
  ExecutorAdapter,
  ExecutorArtifacts,
  ExecutorEvent,
  ExecutorStatus,
} from "@jarvis/runtime-protocol";
import { getRepositories } from "../persistence/factory.js";
import { existsSync } from "node:fs";
import {
  getCodingEnvironment,
  getExecutorAdapter,
  selectExecutorAdapter,
} from "../runtimes/coding/public-api.js";
import { runVerification, type VerificationReport } from "../runtimes/coding/verification.js";
import { getWorktreePolicyConfig } from "./worktree-policy.js";

export interface ExecuteExecutorAttemptInput {
  agentRunId: string;
  workspaceId?: string;
  projectId?: string;
  taskId?: string;
  agentId: string;
  adapterId: string;
  taskPrompt: string;
  workingDirectory: string;
  environmentKind?: string;
  environmentMetadata?: Record<string, unknown>;
  timeoutMs?: number;
  permissionPolicy?: "strict" | "normal" | "permissive";
  testCommands?: string[];
  allowedPaths?: string[];
  requiredArtifactTypes?: string[];
  manualCriteria?: string[];
  allowedTools?: string[];
}

export interface ExecutorAttemptOutcome {
  attemptId: string;
  success: boolean;
  artifacts: ExecutorArtifacts;
  verification: VerificationReport[];
  error?: string;
  manualInterventionRequired?: boolean;
}

const TERMINAL_STATUSES = new Set<ExecutorStatus>([
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
  "cleanup_failed",
]);

export const selectExecutorForAttempt = selectExecutorAdapter;

export async function executeExecutorAttempt(
  input: ExecuteExecutorAttemptInput,
): Promise<ExecutorAttemptOutcome> {
  const { executorRuns, agentRunEvents } = getRepositories();
  const adapter = getExecutorAdapter(input.adapterId);
  if (!adapter) {
    throw new Error(`Unknown executor adapter: ${input.adapterId}`);
  }

  const previousAttempts = await executorRuns.getByAgentRun(input.agentRunId);
  if (previousAttempts.some((candidate) => !TERMINAL_STATUSES.has(candidate.status))) {
    throw new Error(`Agent run already has an active executor attempt: ${input.agentRunId}`);
  }
  const now = new Date();
  const attempt = await executorRuns.create({
    agentRunId: input.agentRunId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    taskId: input.taskId,
    agentId: input.agentId,
    adapterId: input.adapterId,
    domain: "coding",
    taskPrompt: input.taskPrompt,
    environmentKind: input.environmentKind ?? "git-worktree",
    environmentConfig: input.environmentMetadata,
    workingDirectory: input.workingDirectory,
    timeoutMs: input.timeoutMs,
    attemptNumber: Math.max(0, ...previousAttempts.map((candidate) => candidate.attemptNumber)) + 1,
    heartbeatAt: now.toISOString(),
    leaseOwner: `daemon:${process.pid}`,
    leaseExpiresAt: new Date(now.getTime() + (input.timeoutMs ?? 300_000) + 30_000).toISOString(),
  });

  let artifacts: ExecutorArtifacts = { runId: attempt.id, artifacts: [] };
  const verification: VerificationReport[] = [];
  let sequence = 0;
  let envSessionId: string | undefined;
  let effectiveWorkingDir = input.workingDirectory;
  let effectiveMetadata: Record<string, unknown> = { ...(input.environmentMetadata ?? {}) };
  const environmentKind = input.environmentKind ?? "git-worktree";

  try {
    await executorRuns.updateStatus(attempt.id, "preparing_environment");

    // Isolate the run in a dedicated worktree + agent branch whenever the
    // target repository exists. Without this the agent edits the user's
    // checkout directly and nothing can be reviewed or rolled back.
    if (environmentKind === "git-worktree" && existsSync(input.workingDirectory)) {
      const branchName = `agent/${input.agentRunId.slice(0, 8)}`;
      try {
        const env = getCodingEnvironment();
        const session = await env.createSession({
          workspaceId: input.workspaceId ?? "default",
          projectId: input.projectId,
          runId: attempt.id,
          agentId: input.agentId,
          environmentKind,
          workingDirectory: input.workingDirectory,
          metadata: {
            ...input.environmentMetadata,
            // Authoritative isolation facts come last so caller metadata
            // cannot shadow the derived branch or repo path.
            branchName,
            repoPath: input.workingDirectory,
          },
        });
        envSessionId = session.id;
        if (session.workingDirectory) {
          effectiveWorkingDir = session.workingDirectory;
          effectiveMetadata = {
            ...effectiveMetadata,
            sessionId: session.id,
            worktreePath: session.workingDirectory,
            branchName,
          };
          await executorRuns.update(attempt.id, {
            workingDirectory: effectiveWorkingDir,
            environmentConfig: effectiveMetadata,
          });
        }
      } catch (envErr) {
        if (getWorktreePolicyConfig().requireWorktreePath) throw envErr;
        await agentRunEvents.create({
          runId: input.agentRunId,
          sequence: sequence++,
          type: "executor.environment_downgrade",
          payload: {
            attemptId: attempt.id,
            environmentKind,
            workingDirectory: input.workingDirectory,
            reason: envErr instanceof Error ? envErr.message : String(envErr),
          },
        });
      }
    }

    const handle = await adapter.prepare({
      runId: attempt.id,
      taskId: input.taskId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      agentId: input.agentId,
      adapterId: input.adapterId,
      taskPrompt: input.taskPrompt,
      environment: {
        kind: environmentKind,
        workingDirectory: effectiveWorkingDir,
        metadata: effectiveMetadata,
      },
      timeoutMs: input.timeoutMs,
      permissionPolicy: input.permissionPolicy,
      metadata: { allowedTools: input.allowedTools },
    });
    await adapter.start(handle);
    await executorRuns.update(attempt.id, { pid: handle.pid });
    await executorRuns.updateStatus(attempt.id, "running");

    const capabilities = adapter.getCapabilities();
    if (capabilities.streamEvents) {
      for await (const event of adapter.streamEvents(attempt.id)) {
        await persistEvent(input.agentRunId, attempt.id, sequence++, event, agentRunEvents);
        const nativeIds = extractNativeIds(event.metadata);
        await executorRuns.update(attempt.id, {
          eventCursor: sequence,
          heartbeatAt: new Date().toISOString(),
          ...(nativeIds.sessionId ? { nativeSessionId: nativeIds.sessionId } : {}),
          ...(nativeIds.turnId ? { nativeTurnId: nativeIds.turnId } : {}),
        });
        if (isTerminalEvent(event)) break;
      }
    } else {
      await agentRunEvents.create({
        runId: input.agentRunId,
        sequence: sequence++,
        type: "executor.capability_downgrade",
        payload: { attemptId: attempt.id, capability: "streamEvents", fallback: "bounded_polling" },
      });
    }

    const executorStatus = await waitForTerminalStatus(
      adapter,
      attempt.id,
      input.timeoutMs ?? capabilities.defaultTimeoutMs,
    );
    if (executorStatus.status !== "succeeded") {
      const error = executorStatus.error ?? `Executor ended with status ${executorStatus.status}`;
      await executorRuns.updateStatus(attempt.id, executorStatus.status, error);
      return { attemptId: attempt.id, success: false, artifacts, verification, error };
    }

    await executorRuns.updateStatus(attempt.id, "collecting_artifacts");
    artifacts = await adapter.collectArtifacts(attempt.id);
    await executorRuns.update(attempt.id, {
      artifacts: { items: artifacts.artifacts, finalSummary: artifacts.finalSummary, logPath: artifacts.logPath },
    });

    await executorRuns.updateStatus(attempt.id, "verifying");
    const changedFiles = artifacts.artifacts
      .filter((artifact) => artifact.type === "changed_files")
      .flatMap((artifact) => artifact.content.split(/\r?\n/).filter(Boolean));
    const commands = input.testCommands?.length ? input.testCommands : [undefined];
    for (const testCommand of commands) {
      verification.push(await runVerification(attempt.id, {
        changedFiles,
        artifacts: artifacts.artifacts,
        allowedPaths: input.allowedPaths,
        requiredArtifactTypes: input.requiredArtifactTypes,
        testCommand,
        testCwd: testCommand ? input.workingDirectory : undefined,
      }));
    }

    const failedChecks = verification.flatMap((report) => report.results.filter((result) => !result.passed));
    await agentRunEvents.create({
      runId: input.agentRunId,
      sequence: sequence++,
      type: "executor.verification_completed",
      payload: {
        attemptId: attempt.id,
        passed: failedChecks.length === 0 && !input.manualCriteria?.length,
        reports: verification,
        manualCriteria: input.manualCriteria ?? [],
      },
    });
    await executorRuns.update(attempt.id, {
      artifacts: {
        items: artifacts.artifacts,
        finalSummary: artifacts.finalSummary,
        logPath: artifacts.logPath,
        verification,
      },
    });
    if (failedChecks.length > 0) {
      const error = `Verification failed: ${failedChecks.map((check) => check.checkName).join(", ")}`;
      await executorRuns.updateStatus(attempt.id, "failed", error);
      return { attemptId: attempt.id, success: false, artifacts, verification, error };
    }

    if (input.manualCriteria?.length) {
      const error = `Manual verification required: ${input.manualCriteria.join("; ")}`;
      await executorRuns.update(attempt.id, {
        artifacts: {
          items: artifacts.artifacts,
          finalSummary: artifacts.finalSummary,
          logPath: artifacts.logPath,
          verification,
          manualCriteria: input.manualCriteria,
        },
      });
      await executorRuns.updateStatus(attempt.id, "failed", error);
      return {
        attemptId: attempt.id,
        success: false,
        artifacts,
        verification,
        error,
        manualInterventionRequired: true,
      };
    }

    await executorRuns.updateStatus(attempt.id, "succeeded");
    return { attemptId: attempt.id, success: true, artifacts, verification };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await executorRuns.updateStatus(attempt.id, "failed", message);
    return { attemptId: attempt.id, success: false, artifacts, verification, error: message };
  } finally {
    try {
      await adapter.cleanup(attempt.id);
    } catch {
      // The primary attempt result remains authoritative; cleanup is retried by reconciliation.
    }
    if (envSessionId) {
      // Persist work before disposing: disposal deletes the worktree directory,
      // so anything still uncommitted would be lost with it.
      await deliverWorktreeChanges({
        envSessionId,
        attemptId: attempt.id,
        agentRunId: input.agentRunId,
        taskId: input.taskId,
        artifacts,
        agentRunEvents,
      });
      try {
        await getCodingEnvironment().dispose(envSessionId);
      } catch {
        // Best-effort removal; leftover worktrees are swept by reconciliation.
      }
    }
  }
}

/**
 * Commit the worktree's work onto its agent branch and record the receipt.
 *
 * The branch is the durable deliverable: the worktree directory is removed on
 * dispose, so without this the run's only output would be a text summary.
 */
async function deliverWorktreeChanges(input: {
  envSessionId: string;
  attemptId: string;
  agentRunId: string;
  taskId?: string;
  artifacts: ExecutorArtifacts;
  agentRunEvents: ReturnType<typeof getRepositories>["agentRunEvents"];
}): Promise<void> {
  const environment = getCodingEnvironment();
  if (!environment.commitChanges) return;

  const message = `Jarvis agent run ${input.agentRunId.slice(0, 8)}${input.taskId ? ` (task ${input.taskId.slice(0, 8)})` : ""}`;

  let result;
  try {
    result = await environment.commitChanges(input.envSessionId, message);
  } catch (err) {
    await input.agentRunEvents.create({
      runId: input.agentRunId,
      sequence: Number.MAX_SAFE_INTEGER - 2,
      type: "executor.delivery_failed",
      payload: { attemptId: input.attemptId, reason: err instanceof Error ? err.message : String(err) },
    });
    return;
  }

  await input.agentRunEvents.create({
    runId: input.agentRunId,
    sequence: Number.MAX_SAFE_INTEGER - 2,
    type: result.committed ? "executor.delivered" : "executor.nothing_to_deliver",
    payload: {
      attemptId: input.attemptId,
      branch: result.branch,
      sha: result.sha,
      files: result.files,
      reason: result.reason,
    },
  });

  if (!result.committed || result.files.length === 0) return;

  input.artifacts.artifacts.push({
    type: "changed_files",
    content: result.files.join("\n"),
    metadata: { branch: result.branch, sha: result.sha },
  });
}

/**
 * Fail agent runs that have been "running" longer than any executor could
 * legitimately take.
 *
 * Executor attempts are reconciled above, but a run whose attempt row was
 * already terminal (or never created) stays "running" forever and keeps its
 * task queued, blocking every dependent task in the workspace.
 */
export async function reapStaleAgentRuns(maxAgeMs = 6 * 60 * 60 * 1000): Promise<number> {
  const { agentRuns, tasks } = getRepositories();
  const active = await agentRuns.getActive(200);
  const cutoff = Date.now() - maxAgeMs;
  let reaped = 0;

  for (const run of active) {
    if (run.status !== "running" && run.status !== "waiting_for_approval") continue;
    const startedAt = Date.parse(run.startedAt);
    if (Number.isNaN(startedAt) || startedAt > cutoff) continue;

    await agentRuns.updateStatus(
      run.id,
      "failed",
      "Run exceeded the maximum lifetime and was reaped; it can be retried",
    );
    if (run.taskId) {
      const task = await tasks.getById(run.taskId);
      // Only release tasks still waiting on this run; a task that already
      // finished must not be dragged back to failed.
      if (task && (task.status === "queued" || task.status === "running")) {
        await tasks.update(run.taskId, { status: "failed" });
      }
    }
    reaped++;
  }

  return reaped;
}

export async function cancelExecutorAttempt(agentRunId: string): Promise<boolean> {
  const { executorRuns } = getRepositories();
  const attempts = await executorRuns.getByAgentRun(agentRunId);
  const active = attempts.find((attempt) => !TERMINAL_STATUSES.has(attempt.status));
  if (!active) return false;

  const adapter = getExecutorAdapter(active.adapterId);
  if (!adapter) return false;
  await adapter.requestCancel(active.id);
  await executorRuns.updateStatus(active.id, "cancelled");
  return true;
}

export async function recoverInterruptedExecutorRuns(): Promise<number> {
  const { executorRuns, agentRuns, tasks } = getRepositories();
  const attempts = await executorRuns.getActive();
  for (const attempt of attempts) {
    const attemptError = "Daemon restarted while executor attempt was active";
    await executorRuns.updateStatus(attempt.id, "failed", attemptError);
    if (!attempt.agentRunId) continue;

    const run = await agentRuns.getById(attempt.agentRunId);
    if (!run || run.status === "succeeded" || run.status === "failed" || run.status === "cancelled") {
      continue;
    }
    await agentRuns.updateStatus(
      run.id,
      "failed",
      "Executor state was lost after daemon restart; manual intervention required",
    );
    if (run.taskId) {
      await tasks.update(run.taskId, { status: "blocked", manualInterventionRequired: true });
    }
  }
  return attempts.length;
}

function isTerminalEvent(event: ExecutorEvent): boolean {
  return event.type === "executor.completed" ||
    event.type === "executor.failed" ||
    event.type === "executor.cancelled" ||
    event.type === "executor.timed_out";
}

async function waitForTerminalStatus(
  adapter: ExecutorAdapter,
  runId: string,
  timeoutMs: number,
): Promise<{ status: ExecutorStatus; error?: string; durationMs?: number }> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const status = await adapter.getStatus(runId);
    if (TERMINAL_STATUSES.has(status.status)) return status;
    if (Date.now() >= deadline) {
      await adapter.requestCancel(runId).catch(() => undefined);
      return { status: "timed_out", error: `Executor timed out after ${timeoutMs}ms` };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function persistEvent(
  agentRunId: string,
  attemptId: string,
  sequence: number,
  event: ExecutorEvent,
  repository: ReturnType<typeof getRepositories>["agentRunEvents"],
): Promise<void> {
  await repository.create({
    runId: agentRunId,
    sequence,
    type: event.type,
    payload: { ...event, attemptId },
  });
}

function extractNativeIds(metadata: unknown): { sessionId?: string; turnId?: string } {
  if (!metadata || typeof metadata !== "object") return {};
  const record = metadata as Record<string, unknown>;
  const native = record.native && typeof record.native === "object"
    ? record.native as Record<string, unknown>
    : record;
  const sessionId = [native.session_id, native.sessionId, native.thread_id, native.threadId, native.sessionID]
    .find((value): value is string => typeof value === "string");
  const turnId = [native.turn_id, native.turnId]
    .find((value): value is string => typeof value === "string");
  return { sessionId, turnId };
}
