/**
 * Wraps existing CodingAgentAdapter implementations behind the
 * domain-agnostic ExecutorAdapter interface from @jarvis/runtime-protocol.
 *
 * This keeps coding-specific details (git, worktree, diff, CLI flags)
 * inside the coding domain while exposing a generic executor contract.
 */

import type {
  ExecutorAdapter,
  ExecutorCapabilityProfile,
  ExecutorRunRequest,
  ExecutorHandle,
  ExecutorEvent,
  ExecutorArtifacts,
  ExecutorArtifact,
} from "@jarvis/runtime-protocol";
import type {
  CodingAgentAdapter,
  CodingTask,
} from "./types.js";
import type { NormalizedEvent } from "./events/coding-event.js";

/**
 * Wraps a CodingAgentAdapter as an ExecutorAdapter.
 *
 * The wrapper translates between the domain-agnostic ExecutorAdapter
 * contract and the coding-specific CodingAgentAdapter contract.
 */
export class CodingExecutorAdapterWrapper implements ExecutorAdapter {
  readonly id: string;
  readonly displayName: string;

  constructor(private readonly inner: CodingAgentAdapter) {
    this.id = inner.id;
    this.displayName = inner.displayName;
  }

  async discover() {
    const result = await this.inner.discover();
    return {
      available: result.available,
      version: result.version,
      reason: result.reason,
      transport: result.transport as "sdk" | "cli" | "api",
    };
  }

  getCapabilities(): ExecutorCapabilityProfile {
    return {
      adapterId: this.id,
      domain: "coding",
      nonInteractive: true,
      streamEvents: true,
      structuredOutput: true,
      permissionMode: true,
      toolConfigInjection: true,
      isolatedEnvironment: true,
      cancellation: true,
      resumableSession: false,
      defaultTimeoutMs: 300_000,
    };
  }

  async prepare(request: ExecutorRunRequest): Promise<ExecutorHandle> {
    const task = this.mapRequestToTask(request);
    const handle = await this.inner.startRun(task);
    return {
      runId: handle.runId,
      adapterId: handle.adapterId,
      status: this.mapStatus(handle.status),
      pid: handle.pid,
      startedAt: handle.startedAt,
    };
  }

  async start(handle: ExecutorHandle): Promise<ExecutorHandle> {
    // For CLI adapters, start is already done in prepare (startRun both prepares and starts).
    return handle;
  }

  async *streamEvents(runId: string): AsyncIterable<ExecutorEvent> {
    const stream = this.inner.streamRunEvents(runId);
    for await (const event of stream) {
      yield this.mapEvent(event, runId);
    }
  }

  async getStatus(runId: string) {
    const info = await this.inner.getRunStatus(runId);
    return {
      status: this.mapStatus(info.status),
      error: info.error,
      durationMs: info.durationMs,
    };
  }

  async requestCancel(runId: string): Promise<void> {
    await this.inner.cancelRun(runId);
  }

  async collectArtifacts(runId: string): Promise<ExecutorArtifacts> {
    const codingArtifacts = await this.inner.collectArtifacts(runId);
    const artifacts: ExecutorArtifact[] = codingArtifacts.map((a) => ({
      type: a.type,
      content: a.content,
      summary: a.metadata?.summary as string | undefined,
      metadata: a.metadata,
    }));
    return {
      runId,
      artifacts,
      finalSummary: artifacts.find((a) => a.type === "final_summary")?.content,
      logPath: artifacts.find((a) => a.type === "log_path")?.content,
    };
  }

  async cleanup(_runId: string): Promise<void> {
    // CLI adapters don't need explicit cleanup (process already exited)
  }

  private mapRequestToTask(request: ExecutorRunRequest): CodingTask {
    const env = request.environment;
    return {
      dbRunId: request.runId,
      dbTaskId: request.taskId,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      repoPath: env.workingDirectory ?? "",
      worktreePath: env.metadata?.worktreePath as string | undefined,
      branchName: env.metadata?.branchName as string | undefined,
      taskPrompt: request.taskPrompt,
      allowedPaths: env.metadata?.allowedPaths as string[] | undefined,
      testCommands: env.metadata?.testCommands as string[] | undefined,
      timeoutMs: request.timeoutMs,
      permissionPolicy: request.permissionPolicy,
    };
  }

  private mapStatus(status: string): import("@jarvis/runtime-protocol").ExecutorStatus {
    const statusMap: Record<string, import("@jarvis/runtime-protocol").ExecutorStatus> = {
      pending: "created",
      running: "running",
      succeeded: "succeeded",
      failed: "failed",
      cancelled: "cancelled",
    };
    return statusMap[status] ?? "running";
  }

  private mapEvent(normalized: NormalizedEvent, runId: string): ExecutorEvent {
    return {
      type: this.mapEventType(normalized),
      runId,
      timestamp: normalized.createdAt ?? new Date().toISOString(),
      metadata: normalized.event,
    };
  }

  private mapEventType(normalized: NormalizedEvent): import("@jarvis/runtime-protocol").ExecutorEventType {
    const type = normalized.event.type;
    if (type === "run_completed") return "executor.completed";
    if (type === "run_failed") return "executor.failed";
    if (type === "run_cancelled") return "executor.cancelled";
    if (type === "run_started") return "executor.started";
    if (type === "approval_requested") return "executor.permission_blocked";
    if (type === "artifact_created") return "executor.artifact_produced";
    if (type === "file_written" || type === "file_read") return "executor.artifact_produced";
    return "executor.output";
  }
}

/**
 * Wrap all coding adapters behind ExecutorAdapter.
 */
export function wrapCodingAdapters(
  adapters: CodingAgentAdapter[],
): ExecutorAdapter[] {
  return adapters.map((a) => new CodingExecutorAdapterWrapper(a));
}
