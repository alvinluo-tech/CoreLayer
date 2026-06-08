/**
 * Claude Code adapter for the Coding Runtime.
 *
 * Wraps the `claude` CLI as a subprocess. Actual execution goes through
 * the OSCapabilityBroker for permission enforcement.
 */

import type {
  CodingRuntime,
  CodingTask,
  CodingRunInfo,
  CodingRunEvent,
  CodingArtifact,
} from "./types.js";
import { getCapabilityBroker } from "../../capabilities/os-capability-broker.js";
import { spawnProcess, killProcessTree } from "./process-spawner.js";

/** In-memory store for run tracking */
const runs = new Map<string, CodingRunInfo>();
const processes = new Map<string, number>(); // runId → pid
let sequenceCounter = 0;

export class ClaudeCodeAdapter implements CodingRuntime {
  readonly id = "claude-code";
  readonly name = "Claude Code";

  async createRun(task: CodingTask): Promise<CodingRunInfo> {
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Permission check: shell exec for running claude CLI
    const broker = getCapabilityBroker();
    const decision = await broker.requestShellExec(
      "coding-runtime",
      `claude --prompt "${task.taskPrompt.slice(0, 100)}..."`,
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

    const info: CodingRunInfo = {
      runId,
      adapterId: this.id,
      status: decision.decision === "approval_required" ? "pending" : "running",
      task,
      startedAt: now,
      artifacts: [],
    };
    runs.set(runId, info);

    // If approved, spawn claude subprocess
    if (decision.decision === "allow" || decision.decision === "approval_required") {
      this.spawnClaude(runId, task);
    }

    return info;
  }

  private async spawnClaude(runId: string, task: CodingTask): Promise<void> {
    const args = ["--prompt", task.taskPrompt];

    try {
      const result = await spawnProcess({
        command: "claude",
        args,
        cwd: task.worktreePath ?? task.repoPath,
        timeoutMs: task.timeoutMs ?? 300_000,
      });

      processes.delete(runId);
      const info = runs.get(runId);
      if (!info) return;

      info.completedAt = new Date().toISOString();
      info.durationMs = result.durationMs;

      if (result.exitCode === 0) {
        info.status = "succeeded";
        info.artifacts.push({
          type: "final_summary",
          content: result.stdout || "Task completed successfully",
        });
      } else {
        info.status = "failed";
        info.error = result.stderr || `Exit code ${result.exitCode}`;
        info.artifacts.push({ type: "error", content: info.error });
      }
    } catch (err) {
      const info = runs.get(runId);
      if (!info) return;
      info.status = "failed";
      info.error = err instanceof Error ? err.message : String(err);
      info.completedAt = new Date().toISOString();
      info.artifacts.push({ type: "error", content: info.error });
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

    yield {
      runId,
      sequence: ++sequenceCounter,
      type: "status_change",
      payload: { status: info.status },
      createdAt: new Date().toISOString(),
    };

    // Poll for status changes
    while (info.status === "running" || info.status === "pending") {
      await new Promise((r) => setTimeout(r, 500));
      yield {
        runId,
        sequence: ++sequenceCounter,
        type: "status_change",
        payload: { status: info.status },
        createdAt: new Date().toISOString(),
      };
    }

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
    info.durationMs = new Date(info.completedAt).getTime() - new Date(info.startedAt).getTime();
    return true;
  }

  async collectArtifacts(runId: string): Promise<CodingArtifact[]> {
    const info = runs.get(runId);
    if (!info) throw new Error(`Coding run not found: ${runId}`);
    return info.artifacts;
  }
}
