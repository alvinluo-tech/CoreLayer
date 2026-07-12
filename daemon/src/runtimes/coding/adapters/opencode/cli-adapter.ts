/**
 * OpenCode CLI adapter (skeleton).
 *
 * Wraps the OpenCode CLI as a subprocess. Creates per-run temporary
 * configuration for workspace isolation.
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
import { emitWorkspaceEvent } from "../../../../services/workspace-event-emitter.js";
import { maskObjectSecrets } from "../../../../shared/secret-masking.js";
import { createRunConfig } from "./config-writer.js";
import { JsonlEventDecoder } from "../../events/jsonl-decoder.js";

/** In-memory store for run tracking */
const runs = new Map<string, CodingRunInfo>();
const processes = new Map<string, number>(); // runId → pid
const emitter = new CodingEventEmitter();

export class OpenCodeCliAdapter implements CodingAgentAdapter {
  readonly id = "opencode" as const;
  readonly displayName = "OpenCode";
  readonly name = "OpenCode";

  async discover(): Promise<AdapterAvailability> {
    if (!isCommandAvailable("opencode")) {
      return {
        available: false,
        reason: "OpenCode CLI not found on PATH. Install from: https://github.com/opencode-ai/opencode",
        transport: "cli",
      };
    }

    try {
      const output = execFileSync("opencode", ["--version"], {
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

    // Pre-flight: check if opencode command exists
    if (!isCommandAvailable("opencode")) {
      const info = this.createFailedInfo(runId, task, now, "OpenCode CLI not found on PATH. Install from: https://github.com/opencode-ai/opencode");
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

    // Permission check: shell exec for running opencode CLI
    const broker = getCapabilityBroker();
    const maskedPrompt = maskObjectSecrets({ taskPrompt: task.taskPrompt }).taskPrompt as string;
    const decision = await broker.requestShellExec(
      "coding-runtime",
      `opencode run --format json "${String(maskedPrompt).slice(0, 100)}..."`,
      {
        reason: `OpenCode run for repo: ${task.repoPath}`,
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
      title: "Run started",
      summary: `OpenCode run started for task`,
      severity: "info",
      workspaceId: task.workspaceId ?? "",
      projectId: task.projectId,
      taskId: task.dbTaskId,
      agentRunId: runId,
      runtimeId: "opencode",
      payload: {
        workspaceId: task.workspaceId ?? "",
        projectId: task.projectId ?? "",
        taskId: task.dbTaskId ?? "",
        agentRunId: runId,
        runtimeId: "opencode",
        repoPath: task.repoPath,
        worktreePath: task.worktreePath,
        timeoutMs: task.timeoutMs,
      },
    });

    // Create per-run config
    const appDataDir = process.env.JARVIS_APP_DATA_DIR ?? ".jarvis";
    createRunConfig(appDataDir, runId, { workDir: cwd, permissionPolicy: task.permissionPolicy });

    // Spawn opencode subprocess with live tracking
    const pid = this.spawnOpenCode(runId, task);

    return { runId, adapterId: this.id, status: "running", pid, startedAt: now };
  }

  private spawnOpenCode(runId: string, task: CodingTask): number | undefined {
    const decoder = new JsonlEventDecoder();
    const args = ["run", "--format", "json", task.taskPrompt];
    const appDataDir = process.env.JARVIS_APP_DATA_DIR ?? ".jarvis";
    const configPath = createRunConfig(appDataDir, runId, {
      workDir: task.worktreePath ?? task.repoPath,
      permissionPolicy: task.permissionPolicy,
    });
    const logDir = task.worktreePath
      ? `${task.worktreePath}/.jarvis/logs`
      : undefined;

    const handle = spawnProcessLive({
      command: "opencode",
      args,
      cwd: task.worktreePath ?? task.repoPath,
      timeoutMs: task.timeoutMs ?? 300_000,
      env: { OPENCODE_CONFIG: configPath },
      logDir,
      onStdout: (chunk) => {
        for (const event of decoder.push(chunk)) {
          emitter.emit(runId, { type: "agent_message", text: event.text, native: event.native });
        }
      },
      onStderr: (chunk) => emitter.emit(runId, { type: "agent_message", text: `[stderr] ${chunk}` }),
    });

    // Track PID for cancellation
    if (handle.pid) {
      processes.set(runId, handle.pid);
    }

    // Wait for process to complete
    handle.process.on("close", (code) => {
      processes.delete(runId);
      const info = runs.get(runId);
      if (!info) return;

      info.completedAt = new Date().toISOString();
      info.durationMs = Date.now() - new Date(info.startedAt).getTime();

      const eventCtx = {
        workspaceId: task.workspaceId ?? "",
        projectId: task.projectId ?? "",
        taskId: task.dbTaskId ?? "",
        agentRunId: runId,
        runtimeId: "opencode" as const,
      };

      if (code === 0) {
        info.status = "succeeded";
        const summary = handle.stdout.join("") || "Task completed successfully";
        info.artifacts.push({ type: "final_summary", content: summary });
        emitter.emit(runId, { type: "run_completed", summary });

        emitWorkspaceEvent({
          type: "workspace.run.completed",
          title: "Run completed",
          summary,
          severity: "success",
          ...eventCtx,
          payload: {
            ...eventCtx,
            durationMs: info.durationMs,
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
          title: "Run failed",
          summary: info.error,
          severity: "error",
          ...eventCtx,
          payload: {
            ...eventCtx,
            error: info.error,
          },
        });
      }

      // Collect changed files artifact via git diff
      this.collectChangedFiles(info, task);

      // Persist artifacts to disk and DB
      persistArtifacts(runId, info.artifacts, task.conversationId, eventCtx);
    });

    handle.process.on("error", (err) => {
      processes.delete(runId);
      const info = runs.get(runId);
      if (!info) return;

      info.status = "failed";
      info.error = err.message;
      info.completedAt = new Date().toISOString();
      info.artifacts.push({ type: "error", content: info.error });

      const eventCtx = {
        workspaceId: task.workspaceId ?? "",
        projectId: task.projectId ?? "",
        taskId: task.dbTaskId ?? "",
        agentRunId: runId,
        runtimeId: "opencode" as const,
      };

      emitWorkspaceEvent({
        type: "workspace.run.failed",
        title: "Run failed",
        summary: err.message,
        severity: "error",
        ...eventCtx,
        payload: {
          ...eventCtx,
          error: err.message,
        },
      });

      persistArtifacts(runId, info.artifacts, task.conversationId, eventCtx);
      emitter.emit(runId, { type: "run_failed", error: err.message });
    });

    return handle.pid;
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
