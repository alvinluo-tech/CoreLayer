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

export interface ResumeResult {
  approvalRequestId: string;
  toolResult: ToolResult;
  toolId: string;
  toolName: string;
  runId: string;
}

/** Resume strategy types */
export type ResumeStrategy =
  | "native_session_resume"
  | "prompted_reentry"
  | "manual_block";

/** Pending action status */
export type PendingActionStatus =
  | "blocked"
  | "approved"
  | "resuming"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

/** Pending action record */
export interface PendingActionRecord {
  id: string;
  approvalRequestId: string;
  runId: string;
  executorRunId?: string;
  workspaceId?: string;
  actionFingerprint: string;
  actionPayload: RuntimeAction;
  resumePayload: { strategy: ResumeStrategy; executorSessionId?: string };
  status: PendingActionStatus;
  error?: string;
}

/** In-memory pending action store (will be DB-backed) */
const pendingActions = new Map<string, PendingActionRecord>();

/**
 * Create a pending action when approval is required.
 */
export function createPendingAction(input: {
  approvalRequestId: string;
  runId: string;
  executorRunId?: string;
  workspaceId?: string;
  action: RuntimeAction;
  strategy: ResumeStrategy;
  executorSessionId?: string;
}): PendingActionRecord {
  const id = crypto.randomUUID();

  const record: PendingActionRecord = {
    id,
    approvalRequestId: input.approvalRequestId,
    runId: input.runId,
    executorRunId: input.executorRunId,
    workspaceId: input.workspaceId,
    actionFingerprint: `${input.action.type}:${input.action.target ?? ""}:${input.runId}`,
    actionPayload: input.action,
    resumePayload: {
      strategy: input.strategy,
      executorSessionId: input.executorSessionId,
    },
    status: "blocked",
  };

  pendingActions.set(id, record);
  return record;
}

/**
 * Approve a pending action.
 */
export function approvePendingAction(id: string): PendingActionRecord | null {
  const action = pendingActions.get(id);
  if (!action || action.status !== "blocked") return null;
  action.status = "approved";
  return action;
}

/**
 * Complete a pending action.
 */
export function completePendingAction(id: string, success: boolean, error?: string): PendingActionRecord | null {
  const action = pendingActions.get(id);
  if (!action) return null;
  action.status = success ? "completed" : "failed";
  action.error = error;
  return action;
}

/**
 * Cancel a pending action (user denied).
 */
export function cancelPendingAction(id: string): PendingActionRecord | null {
  const action = pendingActions.get(id);
  if (!action) return null;
  action.status = "cancelled";
  return action;
}

/**
 * Check for duplicate approval (idempotency).
 */
export function isDuplicateApproval(fingerprint: string): boolean {
  return [...pendingActions.values()].some(
    (a) => a.actionFingerprint === fingerprint && (a.status === "completed" || a.status === "resuming"),
  );
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
  const { approvalRequests } = getRepositories();
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

  const payload = request.operationPayload as { args: unknown };

  const registry = getRegistry();
  const tool = registry.resolveTool(request.toolId) ?? registry.getTool(`native:${request.toolId}`);

  if (!tool) {
    return {
      approvalRequestId,
      toolResult: { success: false, error: `Tool not found: ${request.toolId}` },
      toolId: request.toolId,
      toolName: request.toolName,
      runId: request.runId,
    };
  }

  const toolResult = await tool.execute(payload.args);

  return {
    approvalRequestId,
    toolResult,
    toolId: request.toolId,
    toolName: request.toolName,
    runId: request.runId,
  };
}

/** Reset pending actions (for testing) */
export function resetPendingActions(): void {
  pendingActions.clear();
}
