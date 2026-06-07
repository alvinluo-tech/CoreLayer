import { tool } from "ai";
import { z } from "zod";
import { getRepositories } from "../../persistence/factory.js";
import { registerTool } from "../registry.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

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
}
