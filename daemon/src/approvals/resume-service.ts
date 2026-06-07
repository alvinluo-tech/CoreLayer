/**
 * Resume strategy for approved tool executions.
 *
 * After a user approves a pending tool call, this module:
 * 1. Looks up the approval request from DB
 * 2. Re-executes the tool using stored operationKind + operationPayload
 * 3. Returns the tool result for the caller to append to the conversation
 *
 * The approve endpoint (B5) calls executeApprovedTool() and then
 * re-enters the agent loop with the tool result.
 */

import { getRepositories } from "../persistence/factory.js";
import { getRegistry } from "../tools/registry.js";
import type { ToolResult } from "@jarvis/types";

export interface ResumeResult {
  approvalRequestId: string;
  toolResult: ToolResult;
  toolId: string;
  toolName: string;
  runId: string;
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
