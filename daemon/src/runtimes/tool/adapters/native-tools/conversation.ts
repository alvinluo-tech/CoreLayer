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

export function registerConversationTools(): void {
  registerTool("deleteConversation", tool({
    description: "删除指定的对话记录（会话/聊天记录）。当用户明确通过语音或文字指令要求删除当前对话、删除本轮对话、删除这个会话、删除这次聊天，或者指明要删除某个特定的对话时调用此工具。",
    parameters: z.object({
      conversationId: z.string().describe("要删除的对话记录 ID"),
    }),
    execute: async (args: any) => {
      const { conversationId } = args;
      try {
        const deleted = await getRepositories().conversations.delete(conversationId);
        return { 
          success: deleted, 
          message: deleted ? "已成功删除该对话记录。" : "未找到该对话记录，无法删除。" 
        };
      } catch (err) {
        console.error("[ConversationTool] Failed to delete conversation:", err);
        return { 
          success: false, 
          error: err instanceof Error ? err.message : String(err) 
        };
      }
    },
  } as any));

  registerTool("listConversations", tool({
    description: "获取所有对话记录列表，包括每条记录的 ID 和标题。可用于用户询问‘有哪些对话记录’或希望了解对话列表时调用。",
    parameters: z.object({}),
    execute: async () => {
      try {
        const conversations = await getRepositories().conversations.list();
        return { 
          success: true, 
          conversations, 
          count: conversations.length 
        };
      } catch (err) {
        console.error("[ConversationTool] Failed to list conversations:", err);
        return { 
          success: false, 
          error: err instanceof Error ? err.message : String(err) 
        };
      }
    },
  } as any));

  registerTool("deleteConversationsByQuery", tool({
    description: "按关键词批量删除对话记录。适用于用户明确要求删除某一类聊天记录，例如 TICK、自主处理、心跳检查、定时任务等。执行前会匹配标题和消息内容，并返回实际删除数量。",
    parameters: z.object({
      query: z.string().min(1).describe("用于匹配对话标题或消息内容的关键词，例如 TICK、心跳、自主处理"),
      currentConversationId: z.string().optional().describe("当前对话 ID。默认不会删除当前正在进行的对话。"),
      includeCurrent: z.boolean().optional().describe("是否允许删除当前对话，默认 false"),
      maxDelete: z.number().int().min(1).max(200).optional().describe("最多删除多少条，默认 50，最大 200"),
    }),
    execute: async (args: any) => {
      const query = String(args.query ?? "").trim().toLowerCase();
      const currentConversationId = typeof args.currentConversationId === "string" ? args.currentConversationId : undefined;
      const includeCurrent = args.includeCurrent === true;
      const maxDelete = typeof args.maxDelete === "number" ? Math.min(Math.max(args.maxDelete, 1), 200) : 50;
      const queryTerms = buildConversationDeleteTerms(query);

      if (!query) {
        return { success: false, error: "query 不能为空。" };
      }

      try {
        const repo = getRepositories().conversations;
        const conversations = await repo.list();
        const matches: Array<{ id: string; title: string }> = [];

        for (const conversation of conversations) {
          if (matches.length >= maxDelete) break;
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

        if (matches.length === 0) {
          return {
            success: true,
            deleted: 0,
            matched: 0,
            message: `没有找到包含“${args.query}”的对话记录。`,
          };
        }

        const deleted = await repo.deleteMany(matches.map((m) => m.id));
        return {
          success: true,
          deleted,
          matched: matches.length,
          conversations: matches,
          message: `已删除 ${deleted} 条匹配“${args.query}”的对话记录。`,
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
