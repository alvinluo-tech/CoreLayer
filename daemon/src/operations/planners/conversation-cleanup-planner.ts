/**
 * Conversation Cleanup Planner.
 *
 * Converts a cleanup query into a deterministic list of conversations
 * that will be affected. The preview shows exact titles and counts
 * so the user knows exactly what will be deleted.
 */

import { getRepositories } from "../../persistence/factory.js";
import type { OperationPreview } from "../domain/operation.js";
import type { OperationPlanner, PlanContext } from "./operation-planner.js";

export interface ConversationCleanupArgs {
  query?: string;
  excludeConversationId?: string;
  mode?: "by_query" | "batch_delete";
  conversationIds?: string[];
}

export class ConversationCleanupPlanner implements OperationPlanner {
  readonly toolId = "native:deleteConversation";

  async plan(args: unknown, _context: PlanContext): Promise<OperationPreview> {
    const { conversations } = getRepositories();
    const input = args as ConversationCleanupArgs;

    let affectedConversations: Array<{ id: string; title: string }> = [];

    if (input.mode === "batch_delete" && input.conversationIds?.length) {
      // Batch delete: look up each conversation by ID
      const lookups = await Promise.all(
        input.conversationIds.map((id) => conversations.getById(id)),
      );
      affectedConversations = lookups
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .map((c) => ({ id: c.id, title: c.title }));
    } else if (input.query) {
      // Query-based cleanup: search conversations by title
      const all = await conversations.list();
      const query = input.query.toLowerCase();
      affectedConversations = all
        .filter((c: { id: string; title: string }) => c.title.toLowerCase().includes(query))
        .filter((c: { id: string }) => c.id !== input.excludeConversationId)
        .map((c: { id: string; title: string }) => ({ id: c.id, title: c.title }));
    }

    const operationId = `op_cleanup_${Date.now()}`;

    return {
      operationId,
      kind: input.mode === "batch_delete" ? "conversation.batch_delete" : "conversation.cleanup_by_query",
      title: `清理 ${affectedConversations.length} 条对话`,
      summary: affectedConversations.length > 0
        ? `将删除 ${affectedConversations.length} 条匹配的对话${input.excludeConversationId ? "，不包含当前对话" : ""}。`
        : "未找到匹配的对话。",
      risk: "high",
      reversible: false,
      targetCount: affectedConversations.length,
      targets: affectedConversations.map((c) => ({
        id: c.id,
        label: c.title,
        type: "conversation",
      })),
      warnings: ["该操作不可撤销。"],
      payload: {
        conversationIds: affectedConversations.map((c) => c.id),
        excludeConversationId: input.excludeConversationId,
      },
    };
  }
}
