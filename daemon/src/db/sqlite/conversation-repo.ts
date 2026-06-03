import { eq, desc, sql } from "drizzle-orm";
import { db, schema } from "../client.js";
import type {
  ConversationRepository,
  ConversationRow,
  MessageRow,
  MessageInput,
} from "../repository.js";

export function createSqliteConversationRepo(): ConversationRepository {
  return {
    async create(title?: string): Promise<ConversationRow> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const convTitle = title ?? "New Chat";

      db.insert(schema.conversations)
        .values({ id, title: convTitle, createdAt: now, updatedAt: now })
        .run();

      return {
        id,
        userId: "default",
        title: convTitle,
        modelUsed: "mimo-v2.5-pro",
        messageCount: 0,
        promptTokens: 0,
        completionTokens: 0,
        createdAt: now,
        updatedAt: now,
      };
    },

    async list(): Promise<ConversationRow[]> {
      const rows = db
        .select()
        .from(schema.conversations)
        .orderBy(desc(schema.conversations.updatedAt))
        .all();
      return rows as ConversationRow[];
    },

    async getById(id: string): Promise<ConversationRow | null> {
      const row = db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.id, id))
        .get();
      return (row as ConversationRow) ?? null;
    },

    async update(id: string, data: { title?: string }): Promise<ConversationRow> {
      const now = new Date().toISOString();
      db.update(schema.conversations)
        .set({ title: data.title, updatedAt: now })
        .where(eq(schema.conversations.id, id))
        .run();

      const row = db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.id, id))
        .get();
      return row as ConversationRow;
    },

    async delete(id: string): Promise<boolean> {
      const result = db
        .delete(schema.conversations)
        .where(eq(schema.conversations.id, id))
        .run();
      return result.changes > 0;
    },

    async addMessage(conversationId: string, data: MessageInput): Promise<MessageRow> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      db.insert(schema.messages)
        .values({
          id,
          conversationId,
          role: data.role,
          content: data.content,
          toolCalls: data.toolCalls ?? null,
          toolCallId: data.toolCallId ?? null,
          tokenCount: data.tokenCount ?? null,
          createdAt: now,
        })
        .run();

      db.update(schema.conversations)
        .set({
          messageCount: sql`${schema.conversations.messageCount} + 1`,
          updatedAt: now,
        })
        .where(eq(schema.conversations.id, conversationId))
        .run();

      return {
        id,
        conversationId,
        role: data.role,
        content: data.content,
        toolCalls: data.toolCalls ?? null,
        toolCallId: data.toolCallId ?? null,
        tokenCount: data.tokenCount ?? null,
        createdAt: now,
      };
    },

    async getMessages(conversationId: string): Promise<MessageRow[]> {
      const rows = db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, conversationId))
        .all();
      return rows as MessageRow[];
    },

    async clear(): Promise<number> {
      db.delete(schema.messages).run();
      const result = db.delete(schema.conversations).run();
      return result.changes;
    },

    async updateTokenUsage(id: string, promptTokens: number, completionTokens: number): Promise<ConversationRow> {
      db.update(schema.conversations)
        .set({
          promptTokens: sql`${schema.conversations.promptTokens} + ${promptTokens}`,
          completionTokens: sql`${schema.conversations.completionTokens} + ${completionTokens}`,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.conversations.id, id))
        .run();

      const row = db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.id, id))
        .get();
      return row as ConversationRow;
    },
  };
}
