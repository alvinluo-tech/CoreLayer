/**
 * Codex adapter for the Coding Runtime.
 *
 * Wraps the Codex CLI as a subprocess. Actual execution goes through
 * the OSCapabilityBroker for permission enforcement.
 *
 * This is a skeleton — the actual subprocess management will be implemented
 * when the full coding runtime is integrated with the Tauri Core.
 */

import type {
  CodingRuntime,
  CodingTask,
  CodingRunInfo,
  CodingRunEvent,
  CodingArtifact,
} from "./types.js";
import { getCapabilityBroker } from "../capability/os-capability-broker.js";

/** In-memory store for run tracking (will be replaced with DB-backed store) */
const runs = new Map<string, CodingRunInfo>();
let sequenceCounter = 0;

export class CodexAdapter implements CodingRuntime {
  readonly id = "codex";
  readonly name = "Codex";

  async createRun(task: CodingTask): Promise<CodingRunInfo> {
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Permission check: shell exec for running codex CLI
    const broker = getCapabilityBroker();
    const decision = await broker.requestShellExec(
      "coding-runtime",
      `codex --prompt "${task.taskPrompt.slice(0, 100)}..."`,
      {
        reason: `Codex run for repo: ${task.repoPath}`,
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

    // TODO: If approved, spawn `codex` subprocess and stream events
    // For now, this is a skeleton that tracks the run state

    return info;
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
  }

  async cancelRun(runId: string): Promise<boolean> {
    const info = runs.get(runId);
    if (!info) return false;
    if (info.status !== "running" && info.status !== "pending") return false;

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
