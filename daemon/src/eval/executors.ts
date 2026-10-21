/**
 * Executor adapters for the eval harness.
 *
 * Each adapter turns one of Jarvis's real execution paths into the harness's
 * `EvalExecutor` contract. The point is to measure the path a user actually
 * runs, not a simplified stand-in.
 */

import { AcpCodingAdapter } from "../runtimes/coding/adapters/acp/adapter.js";
import { validateClaudeModel } from "../runtimes/coding/adapters/acp/model-guard.js";
import type { EvalTask } from "./corpus.js";
import type { EvalExecutor, ExecutorRunResult } from "./runner.js";

export interface AcpExecutorOptions {
  /** Model pinned for every attempt; must pass the DeepSeek-only guard. */
  model?: string;
  permissionPolicy?: "strict" | "normal" | "permissive";
}

/**
 * Drive the ACP executor the way a coding run does.
 *
 * The adapter is stateful per run id, so each attempt gets a fresh one: a
 * reused adapter would attribute a previous attempt's artifacts to this one.
 */
export function createAcpExecutor(options: AcpExecutorOptions = {}): EvalExecutor {
  const model = options.model?.trim() || process.env.ANTHROPIC_MODEL?.trim() || "";
  const verdict = validateClaudeModel(model);
  if (!verdict.allowed) {
    throw new Error(`ACP eval executor: ${verdict.reason}`);
  }

  return {
    name: `acp:${verdict.model}`,
    async run(task: EvalTask, workspace: string, signal: AbortSignal): Promise<ExecutorRunResult> {
      const adapter = new AcpCodingAdapter();
      const runId = `eval-${task.id}-${crypto.randomUUID().slice(0, 8)}`;

      const abortListener = (): void => {
        void adapter.cancelRun(runId);
      };
      signal.addEventListener("abort", abortListener, { once: true });

      try {
        const handle = await adapter.startRun({
          dbRunId: runId,
          repoPath: workspace,
          taskPrompt: task.prompt,
          executorModel: verdict.model,
          // Every eval task writes into a throwaway repository, so the run is
          // permissive by construction. A stricter policy would escalate the
          // first write and measure the policy instead of the agent.
          permissionPolicy: options.permissionPolicy ?? "permissive",
          timeoutMs: task.timeoutMs,
        });
        if (handle.status === "failed") {
          const info = await adapter.getRunStatus(runId);
          return { status: "failed", error: info.error };
        }

        const settled = await waitForSettlement(adapter, runId, task.timeoutMs, signal);
        const info = await adapter.getRunStatus(runId);
        const artifacts = info.artifacts.map((artifact) => artifact.type);
        return {
          status: settled,
          ...(info.error ? { error: info.error } : {}),
          artifacts,
        };
      } finally {
        signal.removeEventListener("abort", abortListener);
      }
    },
  };
}

/**
 * Poll until the adapter leaves `running`/`pending`.
 *
 * A coding run is not finished when it leaves `running`: the lifecycle service
 * treats `collect_artifacts` and `verifying` as still in flight, and an eval
 * attempt that judged the workspace during those phases would race the commit
 * that makes the work durable. Waiting for the terminal set is also what the
 * production consumer does.
 */
const IN_FLIGHT = new Set(["running", "pending", "preparing_environment", "collecting_artifacts", "verifying"]);

async function waitForSettlement(
  adapter: AcpCodingAdapter,
  runId: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<ExecutorRunResult["status"]> {
  const deadline = Date.now() + timeoutMs + 30_000;
  while (Date.now() < deadline) {
    if (signal.aborted) {
      await adapter.cancelRun(runId);
      return "timed-out";
    }
    const info = await adapter.getRunStatus(runId);
    if (!IN_FLIGHT.has(info.status)) {
      if (info.status === "succeeded") return "succeeded";
      if (info.status === "cancelled") return "cancelled";
      return "failed";
    }
    for await (const event of adapter.streamRunEvents(runId)) {
      if (event.event.type === "run_completed" || event.event.type === "run_failed" || event.event.type === "run_cancelled") {
        break;
      }
    }
  }
  await adapter.cancelRun(runId);
  return "timed-out";
}
