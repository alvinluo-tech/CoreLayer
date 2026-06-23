/**
 * Claude Code CLI adapter.
 *
 * Wraps the `claude` CLI as a subprocess. Actual execution goes through
 * the OSCapabilityBroker for permission enforcement.
 */

import { execFileSync } from "child_process";
import type {
  CodingAgentAdapter,
  CodingTask,
  CodingRunInfo,
  CodingRunHandle,
  CodingArtifact,
  AdapterAvailability,
} from "../../types.js";
import type { NormalizedEvent } from "../../events/coding-event.js";
import { CodingEventEmitter } from "../../events/normalize-event.js";
import { getCapabilityBroker } from "../../../../capabilities/os-capability-broker.js";
import { spawnProcessLive, killProcessTree, isCommandAvailable, validateWorkdirPolicy } from "../../process-spawner.js";
import { logAuditEntry } from "../../../../persistence/audit-log.js";
import { persistArtifacts } from "../../artifact-persistence.js";
import { getRepositories } from "../../../../persistence/factory.js";
import { maskObjectSecrets } from "../../../../shared/secret-masking.js";
import { emitWorkspaceEvent } from "../../../../services/workspace-event-emitter.js";
import { emitVerificationEvent } from "../../../../services/workspace-verification.js";
import {
  createDefaultExecutionPolicy,
  evaluateInteraction,
  type ExecutionPolicy,
} from "../../interaction-broker.js";

/** In-memory store for run tracking */
const runs = new Map<string, CodingRunInfo>();
const processes = new Map<string, number>(); // runId → pid
const emitter = new CodingEventEmitter();

function policyForTask(task: CodingTask): ExecutionPolicy {
  if (task.permissionPolicy === "strict") return createDefaultExecutionPolicy("conservative");
  if (task.permissionPolicy === "permissive") return createDefaultExecutionPolicy("full");
  return createDefaultExecutionPolicy("builder");
}

export class ClaudeCodeCliAdapter implements CodingAgentAdapter {
  readonly id = "claude-code" as const;
  readonly displayName = "Claude Code";
  readonly name = "Claude Code";

  async discover(): Promise<AdapterAvailability> {
    if (!isCommandAvailable("claude")) {
      return {
        available: false,
        reason: "Claude Code CLI not found on PATH. Install with: npm install -g @anthropic-ai/claude-code",
        transport: "cli",
      };
    }

    try {
      const output = execFileSync("claude", ["--version"], {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 5_000,
      }).toString().trim();
      return { available: true, version: output, transport: "cli" };
    } catch {
      return { available: true, transport: "cli" };
    }
  }

  async startRun(task: CodingTask): Promise<CodingRunHandle> {
    const runId = task.dbRunId ?? crypto.randomUUID();
    const now = new Date().toISOString();

    // Pre-flight: check if claude command exists
    if (!isCommandAvailable("claude")) {
      const info = this.createFailedInfo(runId, task, now, "Claude Code CLI not found on PATH. Install with: npm install -g @anthropic-ai/claude-code");
      runs.set(runId, info);
      return { runId, adapterId: this.id, status: "failed", startedAt: now };
    }

    // Require repoPath to be set
    if (!task.repoPath) {
      const info = this.createFailedInfo(runId, task, now, "repoPath is required but was not provided");
      runs.set(runId, info);
      return { runId, adapterId: this.id, status: "failed", startedAt: now };
    }

    // Validate working directory against worktree policy
    const cwd = task.worktreePath ?? task.repoPath;
    const workdirPolicy = validateWorkdirPolicy(cwd);
    if (!workdirPolicy.allowed) {
      const info = this.createFailedInfo(runId, task, now, workdirPolicy.reason!);
      runs.set(runId, info);
      await logAuditEntry({
        actor: "system",
        action: "run.start",
        resource: runId,
        decision: "denied",
        result: workdirPolicy.reason,
        metadata: { adapterId: this.id, cwd },
      });
      return { runId, adapterId: this.id, status: "failed", startedAt: now };
    }

    // Permission check: shell exec for running claude CLI
    const broker = getCapabilityBroker();
    const maskedPrompt = maskObjectSecrets({ taskPrompt: task.taskPrompt }).taskPrompt as string;
    const decision = await broker.requestShellExec(
      "coding-runtime",
      `claude --print "${String(maskedPrompt).slice(0, 100)}..."`,
      {
        reason: `Claude Code run for repo: ${task.repoPath}`,
      },
    );

    if (decision.decision === "deny") {
      const info = this.createFailedInfo(runId, task, now, `Permission denied: ${decision.reason}`);
      runs.set(runId, info);
      return { runId, adapterId: this.id, status: "failed", startedAt: now };
    }

    // If approval required, wait — don't spawn yet
    if (decision.decision === "approval_required") {
      const info: CodingRunInfo = {
        runId,
        adapterId: this.id,
        status: "pending",
        task,
        startedAt: now,
        artifacts: [],
      };
      runs.set(runId, info);
      emitter.emit(runId, { type: "approval_requested", risk: "shell_exec", reason: decision.reason });
      return { runId, adapterId: this.id, status: "pending", startedAt: now };
    }

    const info: CodingRunInfo = {
      runId,
      adapterId: this.id,
      status: "running",
      task,
      startedAt: now,
      artifacts: [],
    };
    runs.set(runId, info);

    // Log successful run start
    await logAuditEntry({
      actor: "user",
      action: "run.start",
      resource: runId,
      decision: "allowed",
      result: "success",
      metadata: { adapterId: this.id, cwd, prompt: String(maskedPrompt).slice(0, 100) },
    });

    emitter.emit(runId, { type: "run_started", runId });

    emitWorkspaceEvent({
      type: "workspace.run.started",
      title: "Claude Code run started",
      summary: `Task: ${task.taskPrompt.slice(0, 60)}...`,
      severity: "info",
      workspaceId: task.workspaceId ?? "",
      projectId: task.projectId,
      taskId: task.dbTaskId,
      agentRunId: runId,
      runtimeId: this.id,
      payload: {
        workspaceId: task.workspaceId ?? "",
        projectId: task.projectId ?? "",
        taskId: task.dbTaskId ?? "",
        agentRunId: runId,
        runtimeId: this.id,
        repoPath: task.repoPath,
        worktreePath: task.worktreePath,
        timeoutMs: task.timeoutMs,
      },
    });

    // Spawn claude subprocess with live tracking
    const pid = this.spawnClaude(runId, task);

    return { runId, adapterId: this.id, status: "running", pid, startedAt: now };
  }

  private spawnClaude(runId: string, task: CodingTask): number | undefined {
    // Claude Code CLI uses --print for non-interactive mode with a prompt
    const args = ["--print", task.taskPrompt];
    const logDir = task.worktreePath
      ? `${task.worktreePath}/.jarvis/logs`
      : undefined;
    const policy = policyForTask(task);
    const handleRef: { current?: ReturnType<typeof spawnProcessLive> } = {};

    const handleInteractiveChunk = (chunk: string) => {
      const decision = evaluateInteraction(chunk, policy);
      if (decision.action === "none") return;

      emitter.emit(runId, {
        type: "agent_message",
        text: `[autonomy] ${decision.reason}`,
      });

      emitWorkspaceEvent({
        type: "workspace.autonomy.decision",
        title: `Autonomy: ${decision.action}`,
        summary: decision.reason,
        severity: decision.action === "block" ? "warning" : "info",
        workspaceId: task.workspaceId ?? "",
        agentRunId: runId,
        payload: {
          workspaceId: task.workspaceId ?? "",
          agentRunId: runId,
          action: decision.action === "block" ? "deny" : decision.action,
          reason: decision.reason,
          interactionKind: decision.kind,
        },
      });

      if (decision.action === "respond") {
        handle.process.stdin?.write(decision.response);
        return;
      }

      const info = runs.get(runId);
      if (info && info.status === "running") {
        info.status = "failed";
        info.error = decision.reason;
        info.completedAt = new Date().toISOString();
        info.durationMs = Date.now() - new Date(info.startedAt).getTime();
        info.artifacts.push({
          type: "error",
          content: decision.reason,
          metadata: { interactionKind: decision.kind },
        });
        persistArtifacts(runId, info.artifacts, task.conversationId, {
          workspaceId: task.workspaceId,
          projectId: task.projectId,
          taskId: task.dbTaskId,
          agentRunId: runId,
          runtimeId: this.id,
        });
        try {
          const { agentRuns } = getRepositories();
          agentRuns.updateArtifacts(runId, info.artifacts).catch(() => {});
        } catch {
          // DB persistence is best-effort
        }
      }

      if (handleRef.current?.pid) {
        killProcessTree(handleRef.current.pid);
        processes.delete(runId);
      }
      emitter.emit(runId, { type: "run_failed", error: decision.reason });
    };

    const handle = spawnProcessLive({
      command: "claude",
      args,
      cwd: task.worktreePath ?? task.repoPath,
      timeoutMs: task.timeoutMs ?? 300_000,
      logDir,
      onStdout: (chunk) => {
        emitter.emit(runId, { type: "agent_message", text: chunk });
        handleInteractiveChunk(chunk);
      },
      onStderr: (chunk) => {
        emitter.emit(runId, { type: "agent_message", text: `[stderr] ${chunk}` });
        handleInteractiveChunk(chunk);
      },
    });
    handleRef.current = handle;

    // Track PID for cancellation
    if (handle.pid) {
      processes.set(runId, handle.pid);
    }

    // Wait for process to complete
    handle.process.on("close", (code) => {
      processes.delete(runId);
      const info = runs.get(runId);
      if (!info) return;
      if (info.status !== "running") return;

      info.completedAt = new Date().toISOString();
      info.durationMs = Date.now() - new Date(info.startedAt).getTime();

      if (code === 0) {
        info.status = "succeeded";
        const summary = handle.stdout.join("") || "Task completed successfully";
        info.artifacts.push({ type: "final_summary", content: summary });
        emitter.emit(runId, { type: "run_completed", summary });

        emitWorkspaceEvent({
          type: "workspace.run.completed",
          title: "Claude Code run completed",
          summary: `Duration: ${info.durationMs}ms, ${info.artifacts.length} artifacts`,
          severity: "success",
          workspaceId: task.workspaceId ?? "",
          projectId: task.projectId,
          taskId: task.dbTaskId,
          agentRunId: runId,
          runtimeId: this.id,
          payload: {
            workspaceId: task.workspaceId ?? "",
            projectId: task.projectId ?? "",
            taskId: task.dbTaskId ?? "",
            agentRunId: runId,
            runtimeId: this.id,
            durationMs: info.durationMs ?? 0,
            artifactCount: info.artifacts.length,
          },
        });
      } else {
        info.status = "failed";
        info.error = handle.stderr.join("") || `Exit code ${code}`;
        info.artifacts.push({ type: "error", content: info.error });
        emitter.emit(runId, { type: "run_failed", error: info.error });

        emitWorkspaceEvent({
          type: "workspace.run.failed",
          title: "Claude Code run failed",
          summary: info.error.slice(0, 100),
          severity: "error",
          workspaceId: task.workspaceId ?? "",
          projectId: task.projectId,
          taskId: task.dbTaskId,
          agentRunId: runId,
          runtimeId: this.id,
          payload: {
            workspaceId: task.workspaceId ?? "",
            projectId: task.projectId ?? "",
            taskId: task.dbTaskId ?? "",
            agentRunId: runId,
            runtimeId: this.id,
            error: info.error,
          },
        });
      }

      // Collect changed files artifact via git diff
      this.collectChangedFiles(info, task);

      // Persist artifacts to disk and DB
      persistArtifacts(runId, info.artifacts, task.conversationId, {
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        taskId: task.dbTaskId,
        agentRunId: runId,
        runtimeId: this.id,
      });
      try {
        const { agentRuns } = getRepositories();
        agentRuns.updateArtifacts(runId, info.artifacts).catch(() => {});
      } catch {
        // DB persistence is best-effort
      }

      // Run verification commands if provided
      if (code === 0 && task.testCommands?.length) {
        this.runVerification(task, runId);
      }
    });

    handle.process.on("error", (err) => {
      processes.delete(runId);
      const info = runs.get(runId);
      if (!info) return;

      info.status = "failed";
      info.error = err.message;
      info.completedAt = new Date().toISOString();
      info.artifacts.push({ type: "error", content: info.error });

      persistArtifacts(runId, info.artifacts, task.conversationId, {
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        taskId: task.dbTaskId,
        agentRunId: runId,
        runtimeId: this.id,
      });
      try {
        const { agentRuns } = getRepositories();
        agentRuns.updateArtifacts(runId, info.artifacts);
      } catch {
        // DB persistence is best-effort
      }

      emitter.emit(runId, { type: "run_failed", error: err.message });

      emitWorkspaceEvent({
        type: "workspace.run.failed",
        title: "Claude Code run failed",
        summary: err.message.slice(0, 100),
        severity: "error",
        workspaceId: task.workspaceId ?? "",
        projectId: task.projectId,
        taskId: task.dbTaskId,
        agentRunId: runId,
        runtimeId: this.id,
        payload: {
          workspaceId: task.workspaceId ?? "",
          projectId: task.projectId ?? "",
          taskId: task.dbTaskId ?? "",
          agentRunId: runId,
          runtimeId: this.id,
          error: err.message,
        },
      });
    });

    return handle.pid;
  }

  private async runVerification(task: CodingTask, runId: string): Promise<void> {
    const cwd = task.worktreePath ?? task.repoPath;
    for (const cmd of task.testCommands ?? []) {
      try {
        const output = execFileSync("sh", ["-c", cmd], {
          cwd,
          timeout: 60_000,
          stdio: ["pipe", "pipe", "pipe"],
          encoding: "utf-8",
        });
        await emitVerificationEvent({
          workspaceId: task.workspaceId ?? "",
          projectId: task.projectId,
          taskId: task.dbTaskId,
          agentRunId: runId,
          command: cmd,
          exitCode: 0,
          output,
        });
      } catch (err: unknown) {
        const exitCode = (err as { status?: number }).status ?? 1;
        const stderr = (err as { stderr?: string }).stderr ?? "";
        await emitVerificationEvent({
          workspaceId: task.workspaceId ?? "",
          projectId: task.projectId,
          taskId: task.dbTaskId,
          agentRunId: runId,
          command: cmd,
          exitCode,
          output: stderr,
        });
      }
    }
  }

  private collectChangedFiles(info: CodingRunInfo, task: CodingTask): void {
    try {
      const repoPath = task.worktreePath ?? task.repoPath;
      const output = execFileSync("git", ["diff", "--name-only"], {
        cwd: repoPath,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 5_000,
      }).toString().trim();

      if (output) {
        info.artifacts.push({
          type: "changed_files",
          content: output,
          metadata: { repoPath },
        });
      }
    } catch {
      // git diff failed — not critical
    }

    // Add log path artifact if available
    const logDir = task.worktreePath
      ? `${task.worktreePath}/.jarvis/logs`
      : undefined;
    if (logDir && info.completedAt) {
      info.artifacts.push({
        type: "log_path",
        content: logDir,
        metadata: { runId: info.runId },
      });
    }
  }

  async getRunStatus(runId: string): Promise<CodingRunInfo> {
    const info = runs.get(runId);
    if (!info) throw new Error(`Coding run not found: ${runId}`);
    return info;
  }

  async *streamRunEvents(runId: string): AsyncIterable<NormalizedEvent> {
    const info = runs.get(runId);
    if (!info) throw new Error(`Coding run not found: ${runId}`);

    const { iterable } = emitter.createStream(runId);

    // Yield initial status
    emitter.emit(runId, { type: "run_started", runId });

    yield* iterable;

    // Yield final status
    emitter.emit(runId, info.status === "succeeded"
      ? { type: "run_completed", summary: info.artifacts.find(a => a.type === "final_summary")?.content ?? "Done" }
      : { type: "run_failed", error: info.error ?? "Unknown error" }
    );

    emitter.cleanup(runId);
  }

  async cancelRun(runId: string): Promise<boolean> {
    const info = runs.get(runId);
    if (!info) return false;
    if (info.status !== "running" && info.status !== "pending") return false;

    // Kill the subprocess
    const pid = processes.get(runId);
    if (pid) {
      killProcessTree(pid);
      processes.delete(runId);
    }

    info.status = "cancelled";
    info.completedAt = new Date().toISOString();
    info.durationMs = Date.now() - new Date(info.startedAt).getTime();
    emitter.emit(runId, { type: "run_cancelled", reason: "Cancelled by user" });

    await logAuditEntry({
      actor: "user",
      action: "run.cancel",
      resource: runId,
      decision: "allowed",
      result: "success",
      metadata: { adapterId: this.id },
    });

    return true;
  }

  async collectArtifacts(runId: string): Promise<CodingArtifact[]> {
    const info = runs.get(runId);
    if (!info) throw new Error(`Coding run not found: ${runId}`);
    return info.artifacts;
  }

  /**
   * @deprecated Use startRun() instead. Kept for backward compatibility with tests.
   */
  async createRun(task: CodingTask): Promise<CodingRunInfo> {
    const handle = await this.startRun(task);
    return this.getRunStatus(handle.runId);
  }

  private createFailedInfo(runId: string, task: CodingTask, now: string, error: string): CodingRunInfo {
    return {
      runId,
      adapterId: this.id,
      status: "failed",
      task,
      startedAt: now,
      completedAt: now,
      artifacts: [{ type: "error", content: error }],
      error,
    };
  }
}
