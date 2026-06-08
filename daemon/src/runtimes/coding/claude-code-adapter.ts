/**
 * Claude Code adapter for the Coding Runtime.
 *
 * Wraps the `claude` CLI as a subprocess. Actual execution goes through
 * the OSCapabilityBroker for permission enforcement.
 */

import { execFileSync } from "child_process";
import type {
  CodingRuntime,
  CodingTask,
  CodingRunInfo,
  CodingRunInfoEvents,
  CodingRunEvent,
  CodingArtifact,
} from "./types.js";
import { getCapabilityBroker } from "../../capabilities/os-capability-broker.js";
import { spawnProcessLive, killProcessTree, isCommandAvailable, validateWorkdirPolicy } from "./process-spawner.js";
import { logAuditEntry } from "../../persistence/audit-log.js";
import { persistArtifacts } from "./artifact-persistence.js";
import { getRepositories } from "../../persistence/factory.js";
import { maskObjectSecrets } from "../../shared/secret-masking.js";

/** In-memory store for run tracking */
const runs = new Map<string, CodingRunInfo>();
const eventQueues = new Map<string, CodingRunInfoEvents>();
const processes = new Map<string, number>(); // runId → pid
let sequenceCounter = 0;

function emitEvent(runId: string, type: string, payload: unknown): void {
  const queue = eventQueues.get(runId);
  if (queue) {
    const event: CodingRunEvent = {
      runId,
      sequence: ++sequenceCounter,
      type: type as CodingRunEvent["type"],
      payload,
      createdAt: new Date().toISOString(),
    };
    queue.events.push(event);
    queue.resolve();
  }
}

export class ClaudeCodeAdapter implements CodingRuntime {
  readonly id = "claude-code";
  readonly name = "Claude Code";

  async createRun(task: CodingTask): Promise<CodingRunInfo> {
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Pre-flight: check if claude command exists
    if (!isCommandAvailable("claude")) {
      const info: CodingRunInfo = {
        runId,
        adapterId: this.id,
        status: "failed",
        task,
        startedAt: now,
        completedAt: now,
        artifacts: [{ type: "error", content: "Claude Code CLI not found on PATH. Install with: npm install -g @anthropic-ai/claude-code" }],
        error: "Claude Code CLI not found on PATH",
      };
      runs.set(runId, info);
      return info;
    }

    // Require repoPath to be set
    if (!task.repoPath) {
      const info: CodingRunInfo = {
        runId,
        adapterId: this.id,
        status: "failed",
        task,
        startedAt: now,
        completedAt: now,
        artifacts: [{ type: "error", content: "repoPath is required but was not provided" }],
        error: "repoPath is required but was not provided",
      };
      runs.set(runId, info);
      return info;
    }

    // Validate working directory against worktree policy
    const cwd = task.worktreePath ?? task.repoPath;
    const workdirPolicy = validateWorkdirPolicy(cwd);
    if (!workdirPolicy.allowed) {
      const info: CodingRunInfo = {
        runId,
        adapterId: this.id,
        status: "failed",
        task,
        startedAt: now,
        completedAt: now,
        artifacts: [{ type: "error", content: workdirPolicy.reason! }],
        error: workdirPolicy.reason,
      };
      runs.set(runId, info);
      await logAuditEntry({
        actor: "system",
        action: "run.start",
        resource: runId,
        decision: "denied",
        result: workdirPolicy.reason,
        metadata: { adapterId: this.id, cwd },
      });
      return info;
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
      const info: CodingRunInfo = {
        runId,
        adapterId: this.id,
        status: "failed",
        task,
        startedAt: now,
        completedAt: now,
        artifacts: [{ type: "error", content: `Permission denied: ${decision.reason}` }],
        error: decision.reason,
      };
      runs.set(runId, info);
      return info;
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
      emitEvent(runId, "approval_required", { reason: decision.reason });
      return info;
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

    // Spawn claude subprocess with live tracking
    this.spawnClaude(runId, task);

    return info;
  }

  private spawnClaude(runId: string, task: CodingTask): void {
    // Claude Code CLI uses --print for non-interactive mode with a prompt
    const args = ["--print", task.taskPrompt];
    const logDir = task.worktreePath
      ? `${task.worktreePath}/.jarvis/logs`
      : undefined;

    const handle = spawnProcessLive({
      command: "claude",
      args,
      cwd: task.worktreePath ?? task.repoPath,
      timeoutMs: task.timeoutMs ?? 300_000,
      logDir,
      onStdout: (chunk) => emitEvent(runId, "stdout", { text: chunk }),
      onStderr: (chunk) => emitEvent(runId, "stderr", { text: chunk }),
    });

    // Track PID for cancellation
    if (handle.pid) {
      processes.set(runId, handle.pid);
      emitEvent(runId, "process_spawned", { pid: handle.pid });
    }

    // Wait for process to complete
    handle.process.on("close", (code) => {
      processes.delete(runId);
      const info = runs.get(runId);
      if (!info) return;

      info.completedAt = new Date().toISOString();
      info.durationMs = Date.now() - new Date(info.startedAt).getTime();

      if (code === 0) {
        info.status = "succeeded";
        info.artifacts.push({
          type: "final_summary",
          content: handle.stdout.join("") || "Task completed successfully",
        });
      } else {
        info.status = "failed";
        info.error = handle.stderr.join("") || `Exit code ${code}`;
        info.artifacts.push({ type: "error", content: info.error });
      }

      // Collect changed files artifact via git diff
      this.collectChangedFiles(info, task);

      // Persist artifacts to disk and DB
      persistArtifacts(runId, info.artifacts);
      const { agentRuns } = getRepositories();
      agentRuns.updateArtifacts(runId, info.artifacts).catch(() => {
        // DB persistence is best-effort
      });

      emitEvent(runId, "process_exited", { exitCode: code });
      emitEvent(runId, "status_change", { status: info.status });
    });

    handle.process.on("error", (err) => {
      processes.delete(runId);
      const info = runs.get(runId);
      if (!info) return;

      info.status = "failed";
      info.error = err.message;
      info.completedAt = new Date().toISOString();
      info.artifacts.push({ type: "error", content: info.error });

      // Persist artifacts to disk and DB
      persistArtifacts(runId, info.artifacts);
      try {
        const { agentRuns } = getRepositories();
        agentRuns.updateArtifacts(runId, info.artifacts);
      } catch {
        // DB persistence is best-effort
      }

      emitEvent(runId, "process_exited", { exitCode: -1, error: err.message });
    });
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

  async *streamRunEvents(runId: string): AsyncIterable<CodingRunEvent> {
    const info = runs.get(runId);
    if (!info) throw new Error(`Coding run not found: ${runId}`);

    // Set up event queue for this run
    let resolve: () => void;
    const eventQueue: CodingRunInfoEvents = {
      events: [],
      resolve: () => resolve?.(),
    };
    eventQueues.set(runId, eventQueue);

    yield {
      runId,
      sequence: ++sequenceCounter,
      type: "status_change",
      payload: { status: info.status },
      createdAt: new Date().toISOString(),
    };

    // Yield events as they arrive
    while (info.status === "running" || info.status === "pending") {
      await new Promise<void>((r) => {
        resolve = r;
        // Also check periodically in case events are missed
        setTimeout(r, 500);
      });

      while (eventQueue.events.length > 0) {
        yield eventQueue.events.shift()!;
      }
    }

    // Yield any remaining events
    while (eventQueue.events.length > 0) {
      yield eventQueue.events.shift()!;
    }

    eventQueues.delete(runId);

    // Final event
    yield {
      runId,
      sequence: ++sequenceCounter,
      type: "status_change",
      payload: { status: info.status, error: info.error },
      createdAt: new Date().toISOString(),
    };
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
    emitEvent(runId, "run_cancelled", {});

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
}
