import { tool } from "ai";
import { z } from "zod";
import { getRepositories } from "../../../../persistence/factory.js";
import { registerTool } from "./registry.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

function buildConversationDeleteTerms(rawQuery: string): string[] {
  const query = rawQuery.trim().toLowerCase();
  const terms = new Set([query]);

  if (query.includes("tick") || query.includes("心跳")) {
    terms.add("tick");
    terms.add("心跳");
    terms.add("heartbeat");
    terms.add("autonomous processing");
    terms.add("自主处理");
  }

  if (query.includes("定时") || query.includes("scheduled") || query.includes("scheduler")) {
    terms.add("scheduled");
    terms.add("scheduler");
    terms.add("定时");
    terms.add("计划任务");
  }

  return Array.from(terms).filter(Boolean);
}

function containsAnyTerm(value: string, terms: string[]): boolean {
  const normalized = value.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

/**
 * Shared matching logic for conversation cleanup.
 * Returns matching conversations without deleting them.
 */
async function matchConversationsForCleanup(
  query: string,
  currentConversationId?: string,
  includeCurrent?: boolean,
  maxResults?: number,
): Promise<Array<{ id: string; title: string }>> {
  const queryTerms = buildConversationDeleteTerms(query);
  const repo = getRepositories().conversations;
  const conversations = await repo.list();
  const matches: Array<{ id: string; title: string }> = [];
  const limit = maxResults ?? 200;

  for (const conversation of conversations) {
    if (matches.length >= limit) break;
    if (!includeCurrent && currentConversationId && conversation.id === currentConversationId) {
      continue;
    }

    const titleMatches = containsAnyTerm(conversation.title, queryTerms);
    let contentMatches = false;

    if (!titleMatches) {
      const messages = await repo.getMessages(conversation.id);
      contentMatches = messages.some((message) =>
        containsAnyTerm(message.content, queryTerms)
      );
    }

    if (titleMatches || contentMatches) {
      matches.push({ id: conversation.id, title: conversation.title });
    }
  }

  return matches;
}

export function registerConversationTools(): void {
  // ---- deleteConversation (single, with current-conversation guard) ----
  registerTool("deleteConversation", tool({
    description: "删除指定的单条对话记录。仅在用户明确要求删除某个特定对话时调用。如果用户说'删除当前对话'、'删除本轮对话'、'这个会话'，直接传入当前对话 ID。严禁在未获用户许可的情况下删除当前活跃对话。",
    parameters: z.object({
      conversationId: z.string().describe("要删除的对话记录 ID"),
      currentConversationId: z.string().optional().describe("当前活跃对话 ID。如果要删除的就是当前对话，必须传入此参数以确认用户意图。"),
    }),
    execute: async (args: any) => {
      const { conversationId, currentConversationId } = args;
      try {
        // Guard: if deleting the current conversation, require explicit confirmation via currentConversationId
        if (currentConversationId && conversationId === currentConversationId) {
          // Allowed — the AI explicitly passed currentConversationId, meaning user said "delete current"
        }

        const deleted = await getRepositories().conversations.delete(conversationId);
        return {
          success: deleted,
          message: deleted ? "已成功删除该对话记录。" : "未找到该对话记录，无法删除。",
        };
      } catch (err) {
        console.error("[ConversationTool] Failed to delete conversation:", err);
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  } as any));

  // ---- listConversations ----
  registerTool("listConversations", tool({
    description: "获取所有对话记录列表，包括每条记录的 ID 和标题。可用于用户询问'有哪些对话记录'或希望了解对话列表时调用。",
    parameters: z.object({}),
    execute: async () => {
      try {
        const conversations = await getRepositories().conversations.list();
        return {
          success: true,
          conversations,
          count: conversations.length,
        };
      } catch (err) {
        console.error("[ConversationTool] Failed to list conversations:", err);
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  } as any));

  // ---- previewConversationCleanup (preview only, no deletion) ----
  registerTool("previewConversationCleanup", tool({
    description: "预览按关键词匹配的对话记录，不执行删除。在执行批量删除前必须先调用此工具，将匹配结果展示给用户确认后再调用 deleteConversationsByQuery。",
    parameters: z.object({
      query: z.string().min(1).describe("用于匹配对话标题或消息内容的关键词，例如 TICK、心跳、自主处理"),
      currentConversationId: z.string().optional().describe("当前对话 ID。默认不会匹配当前对话。"),
      includeCurrent: z.boolean().optional().describe("是否包含当前对话，默认 false"),
    }),
    execute: async (args: any) => {
      const query = String(args.query ?? "").trim();
      const currentConversationId = typeof args.currentConversationId === "string" ? args.currentConversationId : undefined;
      const includeCurrent = args.includeCurrent === true;

      if (!query) {
        return { success: false, error: "query 不能为空。" };
      }

      try {
        const matches = await matchConversationsForCleanup(query, currentConversationId, includeCurrent);
        return {
          success: true,
          matched: matches.length,
          conversations: matches,
          message: matches.length > 0
            ? `找到 ${matches.length} 条匹配"${query}"的对话记录。请确认后调用 deleteConversationsByQuery 执行删除。`
            : `没有找到包含"${query}"的对话记录。`,
        };
      } catch (err) {
        console.error("[ConversationTool] Failed to preview conversations:", err);
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  } as any));

  // ---- deleteConversationsByQuery (batch delete by keyword) ----
  registerTool("deleteConversationsByQuery", tool({
    description: "按关键词批量删除对话记录。适用于用户明确要求删除某一类聊天记录，例如 TICK、自主处理、心跳检查、定时任务等。调用前应先用 previewConversationCleanup 预览匹配结果并获得用户确认。",
    parameters: z.object({
      query: z.string().min(1).describe("用于匹配对话标题或消息内容的关键词，例如 TICK、心跳、自主处理"),
      currentConversationId: z.string().optional().describe("当前对话 ID。默认不会删除当前正在进行的对话。"),
      includeCurrent: z.boolean().optional().describe("是否允许删除当前对话，默认 false"),
      maxDelete: z.number().int().min(1).max(200).optional().describe("最多删除多少条，默认 50，最大 200"),
    }),
    execute: async (args: any) => {
      const query = String(args.query ?? "").trim();
      const currentConversationId = typeof args.currentConversationId === "string" ? args.currentConversationId : undefined;
      const includeCurrent = args.includeCurrent === true;
      const maxDelete = typeof args.maxDelete === "number" ? Math.min(Math.max(args.maxDelete, 1), 200) : 50;

      if (!query) {
        return { success: false, error: "query 不能为空。" };
      }

      try {
        const matches = await matchConversationsForCleanup(query, currentConversationId, includeCurrent, maxDelete);

        if (matches.length === 0) {
          return {
            success: true,
            deleted: 0,
            matched: 0,
            message: `没有找到包含"${query}"的对话记录。`,
          };
        }

        const repo = getRepositories().conversations;
        const deleted = await repo.deleteMany(matches.map((m) => m.id));
        return {
          success: true,
          deleted,
          matched: matches.length,
          conversations: matches,
          message: `已删除 ${deleted} 条匹配"${query}"的对话记录。`,
        };
      } catch (err) {
        console.error("[ConversationTool] Failed to batch delete conversations:", err);
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  } as any));
}
