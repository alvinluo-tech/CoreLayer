/**
 * Operation Executor.
 *
 * Executes an approved operation from its persisted payload.
 * The payload must be the same one from the OperationPreview —
 * no re-planning or LLM re-decision after approval.
 */

import { getRepositories } from "../../persistence/factory.js";
import type { OperationReceipt } from "../domain/operation.js";

export interface ExecuteContext {
  runId?: string;
  conversationId?: string;
}

/**
 * Execute an approved operation by its kind and payload.
 * Returns a receipt describing what was affected.
 */
export async function executeOperation(
  operationKind: string,
  operationPayload: unknown,
  context: ExecuteContext,
): Promise<OperationReceipt> {
  const payload = operationPayload as Record<string, unknown>;
  const operationId = `exec_${Date.now()}`;

  switch (operationKind) {
    case "conversation.cleanup_by_query":
    case "conversation.batch_delete":
      return executeConversationCleanup(operationId, payload, context);

    default:
      return {
        operationId,
        kind: operationKind,
        success: false,
        executedAt: new Date().toISOString(),
        affectedCount: 0,
        error: `Unknown operation kind: ${operationKind}`,
      };
  }
}

async function executeConversationCleanup(
  operationId: string,
  payload: Record<string, unknown>,
  _context: ExecuteContext,
): Promise<OperationReceipt> {
  const { conversations } = getRepositories();
  const conversationIds = (payload.conversationIds as string[]) ?? [];

  let affectedCount = 0;
  const affectedTargets: Array<{ id: string; label: string; type: string }> = [];

  for (const id of conversationIds) {
    const conv = await conversations.getById(id);
    if (conv) {
      await conversations.delete(id);
      affectedCount++;
      affectedTargets.push({ id, label: conv.title, type: "conversation" });
    }
  }

  return {
    operationId,
    kind: "conversation.batch_delete",
    success: true,
    executedAt: new Date().toISOString(),
    affectedCount,
    affectedTargets,
  };
}
