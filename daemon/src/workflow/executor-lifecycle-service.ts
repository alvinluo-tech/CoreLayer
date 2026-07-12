import type {
  ExecutorAdapter,
  ExecutorArtifacts,
  ExecutorEvent,
  ExecutorStatus,
} from "@jarvis/runtime-protocol";
import { getRepositories } from "../persistence/factory.js";
import { getExecutorAdapter, selectExecutorAdapter } from "../runtimes/coding/public-api.js";
import { runVerification, type VerificationReport } from "../runtimes/coding/verification.js";

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

  try {
    await executorRuns.updateStatus(attempt.id, "preparing_environment");
    const handle = await adapter.prepare({
      runId: attempt.id,
      taskId: input.taskId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      agentId: input.agentId,
      adapterId: input.adapterId,
      taskPrompt: input.taskPrompt,
      environment: {
        kind: input.environmentKind ?? "git-worktree",
        workingDirectory: input.workingDirectory,
        metadata: input.environmentMetadata,
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
  }
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
