import { getSupabaseClient } from "./client.js";
import type {
  ConversationRepository,
  ConversationRow,
  MessageRow,
  MessageInput,
} from "../repository.js";

function toConversationRow(row: Record<string, unknown>): ConversationRow {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    modelUsed: row.model_used as string,
    messageCount: (row.message_count as number) ?? 0,
    promptTokens: (row.prompt_tokens as number) ?? 0,
    completionTokens: (row.completion_tokens as number) ?? 0,
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

function toMessageRow(row: Record<string, unknown>): MessageRow {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    role: row.role as MessageRow["role"],
    content: (row.content as string) ?? "",
    toolCalls: (row.tool_calls as string) ?? null,
    toolCallId: (row.tool_call_id as string) ?? null,
    tokenCount: (row.token_count as number) ?? null,
    createdAt: (row.created_at as string) ?? "",
  };
}

export function createSupabaseConversationRepo(): ConversationRepository {
  const client = getSupabaseClient();

  return {
    async create(title?: string): Promise<ConversationRow> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const convTitle = title ?? "New Chat";

      const { data, error } = await client
        .from("conversations")
        .insert({
          id,
          user_id: "default",
          title: convTitle,
          model_used: "mimo-v2.5-pro",
          message_count: 0,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create conversation: ${error.message}`);
      return toConversationRow(data);
    },

    async list(): Promise<ConversationRow[]> {
      const { data, error } = await client
        .from("conversations")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw new Error(`Failed to list conversations: ${error.message}`);
      return (data ?? []).map(toConversationRow);
    },

    async getById(id: string): Promise<ConversationRow | null> {
      const { data, error } = await client
        .from("conversations")
        .select("*")
        .eq("id", id)
        .single();

      if (error) return null;
      return toConversationRow(data);
    },

    async update(id: string, data: { title?: string }): Promise<ConversationRow> {
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = { updated_at: now };
      if (data.title !== undefined) updates.title = data.title;

      const { data: row, error } = await client
        .from("conversations")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update conversation: ${error.message}`);
      return toConversationRow(row);
    },

    async delete(id: string): Promise<boolean> {
      // Delete messages first (no cascade in Supabase by default)
      await client.from("messages").delete().eq("conversation_id", id);
      const { error } = await client.from("conversations").delete().eq("id", id);
      return !error;
    },

    async addMessage(conversationId: string, data: MessageInput): Promise<MessageRow> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      const { data: row, error } = await client
        .from("messages")
        .insert({
          id,
          conversation_id: conversationId,
          role: data.role,
          content: data.content,
          tool_calls: data.toolCalls ?? null,
          tool_call_id: data.toolCallId ?? null,
          token_count: data.tokenCount ?? null,
          created_at: now,
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to add message: ${error.message}`);

      // Increment message count
      await client.rpc("increment_message_count", { conv_id: conversationId });

      return toMessageRow(row);
    },

    async getMessages(conversationId: string): Promise<MessageRow[]> {
      const { data, error } = await client
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw new Error(`Failed to get messages: ${error.message}`);
      return (data ?? []).map(toMessageRow);
    },

    async clear(): Promise<number> {
      await client.from("messages").delete({ count: "exact" }).neq("id", "");
      const { count, error } = await client
        .from("conversations")
        .delete({ count: "exact" })
        .neq("id", "");
      if (error) throw new Error(`Failed to clear conversations: ${error.message}`);
      return count ?? 0;
    },

    async updateTokenUsage(id: string, promptTokens: number, completionTokens: number): Promise<ConversationRow> {
      const { data: current } = await client
        .from("conversations")
        .select("prompt_tokens, completion_tokens")
        .eq("id", id)
        .single();

      const existing = current ?? { prompt_tokens: 0, completion_tokens: 0 };

      const { data: row, error } = await client
        .from("conversations")
        .update({
          prompt_tokens: (existing.prompt_tokens as number) + promptTokens,
          completion_tokens: (existing.completion_tokens as number) + completionTokens,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update token usage: ${error.message}`);
      return toConversationRow(row);
    },
  };
}
