/**
 * Delegation service — lets a run hand work to another run.
 *
 * The caller states an objective and, optionally, narrower bounds. This service
 * validates the request, records the chain, queues the child, and — when the
 * caller asks to wait — returns the child's outcome.
 *
 * Two properties matter more than the mechanics:
 *
 * 1. **Bounds only narrow.** The child's bounds are computed from what the
 *    caller actually holds, never from what it claims. A child that cannot be
 *    narrowed is refused before it exists.
 * 2. **Waiting is bounded.** A parent that blocks on a child without a deadline
 *    turns one hung executor into a hung conversation. Every wait has a
 *    timeout, and a timeout reports the child as still running rather than
 *    pretending it finished.
 */

import { getRepositories } from "../persistence/factory.js";
import type { AgentRunRow } from "../persistence/repository/agent.js";
import { enqueue } from "./queue-service.js";
import {
  DelegationRejected,
  narrowDelegationBounds,
  rootDelegationBounds,
  validateDelegationRequest,
  type DelegationBounds,
  type DelegationRequest,
} from "./delegation-bounds.js";

export interface DispatchAgentInput extends DelegationRequest {
  /** Run that delegates. Its bounds are the ceiling for the child. */
  parentRunId: string;
  /** Wait for the child and return its outcome. Default true. */
  wait?: boolean;
  /** How long the caller is willing to block. Defaults to the child's budget. */
  waitTimeoutMs?: number;
  /** Poll interval while waiting. */
  pollIntervalMs?: number;
}

export interface DispatchAgentResult {
  childRunId: string;
  status: AgentRunRow["status"];
  /** True when the wait ended before the child did. */
  stillRunning: boolean;
  /** What the child delivered, as reported by its run record. */
  artifacts: unknown[];
  error?: string;
}

const DEFAULT_POLL_MS = 1_000;
const MIN_POLL_MS = 100;

/**
 * The bounds a run currently holds.
 *
 * For a run that was delegated, this is what its parent granted. For a root run
 * it is derived from the run's own configuration, which came from the user.
 */
export function boundsOf(run: AgentRunRow): DelegationBounds {
  if (run.delegation) return run.delegation.grantedBounds;
  return rootDelegationBounds({
    allowedTools: run.selectedTools ?? run.agentSnapshot?.tools ?? [],
    ...(run.agentSnapshot?.executorPolicy?.executor
      ? { executor: run.agentSnapshot.executorPolicy.executor }
      : {}),
    ...(run.agentSnapshot?.executorPolicy?.model
      ? { executorModel: run.agentSnapshot.executorPolicy.model }
      : {}),
  });
}

export async function dispatchAgent(input: DispatchAgentInput): Promise<DispatchAgentResult> {
  const { agentRuns } = getRepositories();
  const parent = await agentRuns.getById(input.parentRunId);
  if (!parent) throw new DelegationRejected(`Delegating run ${input.parentRunId} does not exist`);

  const terminal = new Set<AgentRunRow["status"]>(["succeeded", "failed", "cancelled"]);
  if (terminal.has(parent.status)) {
    throw new DelegationRejected(
      `Delegating run ${parent.id} already ended (${parent.status}); a finished run cannot start new work`,
    );
  }

  const parentBounds = boundsOf(parent);
  // Validation runs first: it rejects paths and executor switches outright, and
  // a rejected delegation should not create a run row that then needs cleanup.
  validateDelegationRequest(input, parentBounds);
  const granted = narrowDelegationBounds(parentBounds, input);

  const entry = await enqueue({
    agentId: parent.agentId ?? undefined,
    workspaceId: parent.workspaceId ?? undefined,
    projectId: parent.projectId ?? undefined,
    conversationId: parent.conversationId ?? undefined,
    mode: "workflow",
    selectedModel: granted.executorModel,
    objective: input.task,
    parentRunId: parent.id,
    delegation: {
      parentRunId: parent.id,
      parentBounds,
      grantedBounds: granted,
      dispatchedAt: new Date().toISOString(),
    },
  });

  if (input.wait === false) {
    return { childRunId: entry.runId, status: "queued", stillRunning: true, artifacts: [] };
  }

  return waitForChild(entry.runId, {
    timeoutMs: input.waitTimeoutMs ?? granted.timeoutMs,
    pollIntervalMs: input.pollIntervalMs ?? DEFAULT_POLL_MS,
  });
}

async function waitForChild(
  childRunId: string,
  options: { timeoutMs: number; pollIntervalMs: number },
): Promise<DispatchAgentResult> {
  const { agentRuns } = getRepositories();
  const deadline = Date.now() + options.timeoutMs;
  const interval = Math.max(MIN_POLL_MS, options.pollIntervalMs);

  for (;;) {
    const child = await agentRuns.getById(childRunId);
    if (!child) {
      return { childRunId, status: "failed", stillRunning: false, artifacts: [], error: "Child run disappeared" };
    }
    if (child.completedAt || child.status === "succeeded" || child.status === "failed" || child.status === "cancelled") {
      return {
        childRunId,
        status: child.status,
        stillRunning: false,
        artifacts: child.artifacts ?? [],
        ...(child.error ? { error: child.error } : {}),
      };
    }
    if (Date.now() >= deadline) {
      // Reporting the truth matters here: a caller that believes the child
      // finished will plan on work that does not exist yet.
      return {
        childRunId,
        status: child.status,
        stillRunning: true,
        artifacts: child.artifacts ?? [],
      };
    }
    await delay(interval);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
