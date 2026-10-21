/**
 * Task Graph Executor — drives parallel wave-by-wave execution of task graphs.
 *
 * It consumes a `TaskGraphExecutionPlan`, manages concurrency across waves,
 * injects upstream artifact context into dependent downstream prompts, respects
 * fail-fast directives, and returns an aggregated Map-Reduce summary.
 */

import { getRepositories } from "../persistence/factory.js";
import type { AgentRunRow } from "../persistence/repository/agent.js";
import {
  boundsOf as productionBoundsOf,
  dispatchAgent as productionDispatchAgent,
  type DispatchAgentInput,
  type DispatchAgentResult,
} from "./delegation-service.js";
import {
  planTaskGraph,
  TaskGraphRejected,
  type TaskGraphExecutionPlan,
  type TaskGraphInput,
  type TaskGraphPlanNode,
} from "./task-graph-dag.js";
import type { DelegationBounds } from "./delegation-bounds.js";

export interface TaskGraphNodeResult {
  id: string;
  childRunId?: string;
  status: "succeeded" | "failed" | "skipped" | "timed_out";
  artifacts: unknown[];
  error?: string;
  durationMs: number;
}

export interface TaskGraphExecutionSummary {
  status: "succeeded" | "failed" | "partial";
  totalDurationMs: number;
  completedNodes: number;
  failedNodes: number;
  skippedNodes: number;
  nodeResults: Record<string, TaskGraphNodeResult>;
  parallelPathWarnings: TaskGraphExecutionPlan["parallelPathWarnings"];
}

export interface TaskGraphExecutorDeps {
  dispatch: (input: DispatchAgentInput) => Promise<DispatchAgentResult>;
  getRun: (runId: string) => Promise<AgentRunRow | null>;
  boundsOf: (run: AgentRunRow) => DelegationBounds;
}

function defaultDeps(): TaskGraphExecutorDeps {
  return {
    dispatch: productionDispatchAgent,
    getRun: (runId: string) => getRepositories().agentRuns.getById(runId),
    boundsOf: productionBoundsOf,
  };
}

/**
 * Executes a declarative task graph under a parent run.
 */
export async function executeTaskGraph(
  parentRunId: string,
  input: TaskGraphInput,
  overrides: Partial<TaskGraphExecutorDeps> = {},
): Promise<TaskGraphExecutionSummary> {
  const deps: TaskGraphExecutorDeps = { ...defaultDeps(), ...overrides };
  const startTime = Date.now();

  const parent = await deps.getRun(parentRunId);
  if (!parent) {
    throw new TaskGraphRejected(`Parent run "${parentRunId}" does not exist`);
  }

  const terminalStates = new Set<AgentRunRow["status"]>(["succeeded", "failed", "cancelled"]);
  if (terminalStates.has(parent.status)) {
    throw new TaskGraphRejected(
      `Cannot execute task graph under parent run "${parentRunId}" in terminal state "${parent.status}"`,
    );
  }

  const parentBounds = deps.boundsOf(parent);
  const plan = planTaskGraph(input, parentBounds);

  const nodeResults: Record<string, TaskGraphNodeResult> = {};
  const failedNodeIds = new Set<string>();
  const deadline = startTime + plan.totalTimeoutMs;

  for (let w = 0; w < plan.waves.length; w++) {
    const wave = plan.waves[w];
    const now = Date.now();

    // Check overall timeout
    if (now >= deadline) {
      for (let restWave = w; restWave < plan.waves.length; restWave++) {
        for (const nodeId of plan.waves[restWave]) {
          nodeResults[nodeId] = {
            id: nodeId,
            status: "timed_out",
            artifacts: [],
            error: "Overall task graph timeout exceeded",
            durationMs: 0,
          };
        }
      }
      break;
    }

    // Determine nodes to run vs skip in this wave
    const nodesToDispatch: TaskGraphPlanNode[] = [];

    for (const nodeId of wave) {
      const node = plan.nodes[nodeId];

      if (plan.failFast && failedNodeIds.size > 0) {
        nodeResults[nodeId] = {
          id: nodeId,
          status: "skipped",
          artifacts: [],
          error: `Skipped due to failFast after failure in node(s): ${Array.from(failedNodeIds).join(", ")}`,
          durationMs: 0,
        };
        continue;
      }

      // Check if any upstream dependencies failed or were skipped
      const brokenDep = node.dependencies.find((depId) => {
        const depResult = nodeResults[depId];
        return !depResult || depResult.status !== "succeeded";
      });

      if (brokenDep) {
        nodeResults[nodeId] = {
          id: nodeId,
          status: "skipped",
          artifacts: [],
          error: `Skipped because dependency "${brokenDep}" did not succeed`,
          durationMs: 0,
        };
        continue;
      }

      nodesToDispatch.push(node);
    }

    if (nodesToDispatch.length === 0) {
      continue;
    }

    // Dispatch wave concurrently
    const waveRemainingMs = Math.max(1_000, deadline - Date.now());
    const dispatchPromises = nodesToDispatch.map((node) =>
      dispatchGraphNode(parentRunId, node, nodeResults, waveRemainingMs, deps),
    );

    const outcomes = await Promise.allSettled(dispatchPromises);

    for (let i = 0; i < nodesToDispatch.length; i++) {
      const node = nodesToDispatch[i];
      const outcome = outcomes[i];

      if (outcome.status === "fulfilled") {
        nodeResults[node.id] = outcome.value;
        if (outcome.value.status !== "succeeded") {
          failedNodeIds.add(node.id);
        }
      } else {
        const errorMsg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        nodeResults[node.id] = {
          id: node.id,
          status: "failed",
          artifacts: [],
          error: errorMsg,
          durationMs: 0,
        };
        failedNodeIds.add(node.id);
      }
    }
  }

  // Aggregate final summary
  let completedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const res of Object.values(nodeResults)) {
    if (res.status === "succeeded") completedCount++;
    else if (res.status === "skipped") skippedCount++;
    else failedCount++;
  }

  let finalStatus: TaskGraphExecutionSummary["status"] = "succeeded";
  if (failedCount > 0 && completedCount === 0) {
    finalStatus = "failed";
  } else if (failedCount > 0 || skippedCount > 0) {
    finalStatus = "partial";
  }

  return {
    status: finalStatus,
    totalDurationMs: Date.now() - startTime,
    completedNodes: completedCount,
    failedNodes: failedCount,
    skippedNodes: skippedCount,
    nodeResults,
    parallelPathWarnings: plan.parallelPathWarnings,
  };
}

async function dispatchGraphNode(
  parentRunId: string,
  node: TaskGraphPlanNode,
  previousResults: Record<string, TaskGraphNodeResult>,
  maxWaitMs: number,
  deps: TaskGraphExecutorDeps,
): Promise<TaskGraphNodeResult> {
  const nodeStart = Date.now();

  // Inject upstream dependency context into prompt
  const augmentedPrompt = buildAugmentedPrompt(node, previousResults);
  const nodeTimeout = Math.min(node.bounds.timeoutMs, maxWaitMs);

  try {
    const dispatchResult = await deps.dispatch({
      parentRunId,
      task: augmentedPrompt,
      allowedPaths: node.bounds.allowedPaths,
      testCommands: node.bounds.testCommands,
      requiredArtifactTypes: node.bounds.requiredArtifactTypes,
      timeoutMs: nodeTimeout,
      allowedTools: node.bounds.allowedTools,
      executorModel: node.bounds.executorModel,
      executor: node.bounds.executor,
      wait: true,
      waitTimeoutMs: nodeTimeout,
    });

    const elapsed = Date.now() - nodeStart;

    if (dispatchResult.stillRunning) {
      return {
        id: node.id,
        childRunId: dispatchResult.childRunId,
        status: "timed_out",
        artifacts: dispatchResult.artifacts,
        error: `Node "${node.id}" exceeded wait deadline of ${nodeTimeout}ms`,
        durationMs: elapsed,
      };
    }

    if (dispatchResult.status === "succeeded") {
      return {
        id: node.id,
        childRunId: dispatchResult.childRunId,
        status: "succeeded",
        artifacts: dispatchResult.artifacts,
        durationMs: elapsed,
      };
    }

    return {
      id: node.id,
      childRunId: dispatchResult.childRunId,
      status: "failed",
      artifacts: dispatchResult.artifacts,
      error: dispatchResult.error || `Node "${node.id}" ended with status ${dispatchResult.status}`,
      durationMs: elapsed,
    };
  } catch (err) {
    return {
      id: node.id,
      status: "failed",
      artifacts: [],
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - nodeStart,
    };
  }
}

function buildAugmentedPrompt(
  node: TaskGraphPlanNode,
  previousResults: Record<string, TaskGraphNodeResult>,
): string {
  if (node.dependencies.length === 0) {
    return node.task;
  }

  const contextLines: string[] = ["[Upstream Dependency Context]"];
  for (const depId of node.dependencies) {
    const depRes = previousResults[depId];
    if (!depRes) continue;

    contextLines.push(`- Predecessor node "${depId}" (${depRes.status}):`);
    if (depRes.artifacts.length > 0) {
      contextLines.push(`  Artifacts: ${JSON.stringify(depRes.artifacts)}`);
    }
  }

  contextLines.push("", "[Your Objective]", node.task);
  return contextLines.join("\n");
}
