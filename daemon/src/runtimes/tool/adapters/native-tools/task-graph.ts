/**
 * `run_task_graph` — execute a declarative DAG of coding sub-tasks.
 *
 * The calling agent defines an acyclic graph of jobs, their dependencies, and
 * per-node allowed write scopes. The engine computes topological execution waves,
 * dispatches independent nodes concurrently in isolated worktrees, injects upstream
 * results into dependent prompts, and returns an aggregated Map-Reduce report.
 */

import { tool } from "ai";
import { z } from "zod";
import { registerTool } from "./registry.js";
import { currentRunId } from "../../domain/tool-call-id.js";
import type {
  executeTaskGraph as executeTaskGraphFn,
  TaskGraphExecutionSummary,
} from "../../../../workflow/task-graph-executor.js";
import {
  MAX_DELEGATION_TIMEOUT_MS,
  MIN_DELEGATION_TIMEOUT_MS,
} from "../../../../workflow/delegation-bounds.js";
import type { TaskGraphInput } from "../../../../workflow/task-graph-dag.js";

export interface TaskGraphToolDeps {
  execute: typeof executeTaskGraphFn;
  isRejection: (error: unknown) => boolean;
}

export function registerTaskGraphTools(deps?: Partial<TaskGraphToolDeps>): number {
  let cached: TaskGraphToolDeps | null = null;
  const resolveDeps = async (): Promise<TaskGraphToolDeps> => {
    if (cached) return cached;
    const executor = await import("../../../../workflow/task-graph-executor.js");
    const dag = await import("../../../../workflow/task-graph-dag.js");
    const bounds = await import("../../../../workflow/delegation-bounds.js");

    cached = {
      execute: deps?.execute ?? executor.executeTaskGraph,
      isRejection:
        deps?.isRejection ??
        ((error: unknown) =>
          error instanceof dag.TaskGraphRejected || error instanceof bounds.DelegationRejected),
    };
    return cached;
  };

  registerTool(
    "run_task_graph",
    tool({
      description:
        "Execute a declarative Directed Acyclic Graph (DAG) of coding sub-tasks. " +
        "Define nodes with their tasks, dependencies, and allowed paths. " +
        "Independent nodes in the same wave run concurrently in isolated worktrees. " +
        "Upstream artifacts are automatically injected into downstream prompts. " +
        "Returns an aggregated execution report with per-node status, artifacts, and diff warnings.",
      parameters: z.object({
        nodes: z
          .array(
            z.object({
              id: z
                .string()
                .min(1)
                .max(64)
                .describe("Unique identifier for this node (e.g. 'parse-ast', 'gen-client')"),
              task: z
                .string()
                .min(1)
                .describe("Self-contained instruction for this sub-task"),
              dependencies: z
                .array(z.string())
                .optional()
                .describe("IDs of prerequisite nodes that must succeed before this node starts"),
              allowedPaths: z
                .array(z.string())
                .optional()
                .describe("Glob patterns this node may modify. Must be within your own scope"),
              testCommands: z
                .array(z.string())
                .optional()
                .describe("Commands this node's work must pass before completing"),
              requiredArtifactTypes: z
                .array(z.string())
                .optional()
                .describe("Artifact types this node must produce"),
              timeoutMs: z
                .number()
                .int()
                .positive()
                .max(MAX_DELEGATION_TIMEOUT_MS)
                .optional()
                .describe("Wall-clock budget for this specific node in milliseconds"),
            }),
          )
          .min(1)
          .max(16)
          .describe("The list of nodes in the task graph"),
        failFast: z
          .boolean()
          .optional()
          .describe("Stop downstream branches if any node fails (default true)"),
        totalTimeoutMs: z
          .number()
          .int()
          .positive()
          .min(MIN_DELEGATION_TIMEOUT_MS)
          .max(MAX_DELEGATION_TIMEOUT_MS)
          .optional()
          .describe("Total wall-clock budget for the entire task graph execution"),
      }),
      execute: async (args: TaskGraphInput) => {
        const parentRunId = currentRunId();
        if (!parentRunId) {
          throw new Error(
            "run_task_graph is only available inside an agent run; there is no parent run to orchestrate from",
          );
        }

        const { execute, isRejection } = await resolveDeps();

        try {
          const summary: TaskGraphExecutionSummary = await execute(parentRunId, {
            nodes: args.nodes,
            ...(args.failFast !== undefined ? { failFast: args.failFast } : {}),
            ...(args.totalTimeoutMs !== undefined ? { totalTimeoutMs: args.totalTimeoutMs } : {}),
          });

          return {
            ...summary,
            note:
              summary.status === "succeeded"
                ? `All ${summary.completedNodes} task graph nodes finished successfully.`
                : summary.status === "partial"
                  ? `Task graph partially succeeded (${summary.completedNodes} completed, ${summary.failedNodes} failed, ${summary.skippedNodes} skipped).`
                  : `Task graph failed (${summary.failedNodes} failed, ${summary.skippedNodes} skipped).`,
          };
        } catch (error) {
          if (isRejection(error)) {
            return {
              status: "rejected" as const,
              error: (error as Error).message,
            };
          }
          throw error;
        }
      },
    } as never),
  );

  return 1;
}
