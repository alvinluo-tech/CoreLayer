/**
 * Resume strategy for approved tool executions and pending actions.
 *
 * After a user approves a pending tool call or action, this module:
 * 1. Looks up the approval request from DB
 * 2. Re-executes the tool using stored operationKind + operationPayload
 * 3. Returns the tool result for the caller to append to the conversation
 *
 * For pending actions with resume strategies:
 * - native_session_resume: continue executor session
 * - prompted_reentry: restart with approved context
 * - manual_block: keep blocked with explicit user action
 */

import { getRepositories } from "../persistence/factory.js";
import { getRegistry } from "../runtimes/tool/public-api.js";
import type { ToolResult } from "@jarvis/types";
import type { RuntimeAction } from "@jarvis/runtime-protocol";
import type {
  PendingActionRow,
  PendingActionStatus,
  PendingActionResumeStrategy,
} from "../persistence/repository/pending-action.js";
import { createHash } from "node:crypto";

export interface ResumeResult {
  approvalRequestId: string;
  toolResult: ToolResult;
  toolId: string;
  toolName: string;
  runId: string;
}

/** Resume strategy types */
export type ResumeStrategy = PendingActionResumeStrategy;

/** Pending action status */
export type { PendingActionStatus };

/** Pending action record */
export type PendingActionRecord = PendingActionRow;

/**
 * Create a pending action when approval is required.
 */
export async function createPendingAction(input: {
  approvalRequestId: string;
  runId: string;
  executorRunId?: string;
  workspaceId?: string;
  action: RuntimeAction;
  strategy: ResumeStrategy;
  executorSessionId?: string;
  nativeResumeSupported?: boolean;
}): Promise<PendingActionRecord> {
  if (input.strategy === "native_session_resume" && !input.nativeResumeSupported) {
    throw new Error("native_session_resume requires an adapter with resumableSession capability");
  }
  const { pendingActions } = getRepositories();
  return pendingActions.create({
    approvalRequestId: input.approvalRequestId,
    runId: input.runId,
    executorRunId: input.executorRunId,
    workspaceId: input.workspaceId,
    actionFingerprint: createHash("sha256")
      .update(`${input.runId}:${canonicalJson(input.action)}`)
      .digest("hex"),
    actionPayload: input.action,
    resumePayload: {
      strategy: input.strategy,
      executorSessionId: input.executorSessionId,
    },
  });
}

/**
 * Approve a pending action.
 */
export async function approvePendingAction(id: string): Promise<PendingActionRecord | null> {
  return getRepositories().pendingActions.transition(id, ["blocked"], "approved");
}

/**
 * Complete a pending action.
 */
export async function completePendingAction(id: string, success: boolean, error?: string): Promise<PendingActionRecord | null> {
  return getRepositories().pendingActions.transition(
    id,
    ["approved", "resuming", "executing", "blocked"],
    success ? "completed" : "failed",
    error,
  );
}

/**
 * Cancel a pending action (user denied).
 */
export async function cancelPendingAction(id: string): Promise<PendingActionRecord | null> {
  return getRepositories().pendingActions.transition(
    id,
    ["blocked", "approved"],
    "cancelled",
  );
}

/**
 * Check for duplicate approval (idempotency).
 */
export async function isDuplicateApproval(fingerprint: string): Promise<boolean> {
  const action = await getRepositories().pendingActions.getByFingerprint(fingerprint);
  return action?.status === "completed" || action?.status === "resuming" || action?.status === "executing";
}

/**
 * Execute an approved tool and return the result.
 *
 * Looks up the approval request by ID, verifies it's approved,
 * then re-executes the tool using the stored operation payload.
 */
export async function executeApprovedTool(
  approvalRequestId: string,
): Promise<ResumeResult> {
  const { approvalRequests, pendingActions } = getRepositories();
  const request = await approvalRequests.getById(approvalRequestId);

  if (!request) {
    throw new Error(`Approval request not found: ${approvalRequestId}`);
  }

  if (request.status !== "approved") {
    throw new Error(`Approval request is not approved: ${request.status}`);
  }

  if (!request.operationKind || !request.operationPayload) {
    throw new Error(`Approval request missing resume payload: ${approvalRequestId}`);
  }

  const pending = await pendingActions.getByApprovalRequest(approvalRequestId);
  if (pending?.status === "completed" && pending.result) {
    return pending.result as ResumeResult;
  }
  if (pending) {
    const claimed = await pendingActions.transition(pending.id, ["approved"], "executing");
    if (!claimed) {
      throw new Error(`Approval action is already being resumed: ${approvalRequestId}`);
    }
  }

  const payload = request.operationPayload as { args: unknown };

  const registry = getRegistry();
  const tool = registry.resolveTool(request.toolId) ?? registry.getTool(`native:${request.toolId}`);

  if (!tool) {
    const result = {
      approvalRequestId,
      toolResult: { success: false, error: `Tool not found: ${request.toolId}` },
      toolId: request.toolId,
      toolName: request.toolName,
      runId: request.runId,
    };
    if (pending) await pendingActions.transition(pending.id, ["executing"], "completed", undefined, result);
    return result;
  }

  const toolResult = await tool.execute(payload.args);

  const result = {
    approvalRequestId,
    toolResult,
    toolId: request.toolId,
    toolName: request.toolName,
    runId: request.runId,
  };
  if (pending) {
    await pendingActions.transition(
      pending.id,
      ["executing"],
      toolResult.success ? "completed" : "failed",
      toolResult.success ? undefined : toolResult.error,
      result,
    );
  }
  return result;
}

/** Reset pending actions (for testing) */
export async function resetPendingActions(): Promise<void> {
  await getRepositories().pendingActions.deleteAll();
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
