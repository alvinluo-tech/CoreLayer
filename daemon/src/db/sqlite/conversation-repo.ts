import { eq, desc, sql } from "drizzle-orm";
import { db, schema } from "../client.js";
import type {
  ConversationRepository,
  ConversationRow,
  MessageRow,
  MessageInput,
  MessageTreeNode,
  SearchResult,
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

    async update(id: string, data: { title?: string; modelUsed?: string }): Promise<ConversationRow> {
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = { updatedAt: now };
      if (data.title !== undefined) updates.title = data.title;
      if (data.modelUsed !== undefined) updates.modelUsed = data.modelUsed;
      db.update(schema.conversations)
        .set(updates)
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
          parentMessageId: data.parentMessageId ?? null,
          tokenCount: data.tokenCount ?? null,
          compressed: false,
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
        parentMessageId: data.parentMessageId ?? null,
        tokenCount: data.tokenCount ?? null,
        compressed: false,
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

    async editMessage(conversationId: string, messageId: string, newContent: string): Promise<MessageRow> {
      const now = new Date().toISOString();

      db.update(schema.messages)
        .set({ content: newContent })
        .where(eq(schema.messages.id, messageId))
        .run();

      db.update(schema.conversations)
        .set({ updatedAt: now })
        .where(eq(schema.conversations.id, conversationId))
        .run();

      const row = db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.id, messageId))
        .get();
      return row as MessageRow;
    },

    async getMessageBranches(messageId: string): Promise<MessageRow[]> {
      const targetMsg = db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.id, messageId))
        .get() as MessageRow | undefined;

      if (!targetMsg) return [];

      if (targetMsg.parentMessageId) {
        const rows = db
          .select()
          .from(schema.messages)
          .where(eq(schema.messages.parentMessageId, targetMsg.parentMessageId))
          .all();
        return rows as MessageRow[];
      }

      const rows = db
        .select()
        .from(schema.messages)
        .where(sql`${schema.messages.parentMessageId} IS NULL AND ${schema.messages.conversationId} = ${targetMsg.conversationId}`)
        .all();
      return rows as MessageRow[];
    },

    async getConversationTree(conversationId: string): Promise<MessageTreeNode[]> {
      const rows = db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, conversationId))
        .all() as MessageRow[];

      const nodeMap = new Map<string, MessageTreeNode>();
      for (const msg of rows) {
        nodeMap.set(msg.id, { message: msg, children: [] });
      }

      const roots: MessageTreeNode[] = [];
      for (const msg of rows) {
        const node = nodeMap.get(msg.id)!;
        if (msg.parentMessageId && nodeMap.has(msg.parentMessageId)) {
          nodeMap.get(msg.parentMessageId)!.children.push(node);
        } else {
          roots.push(node);
        }
      }

      return roots;
    },

    async deleteMessage(messageId: string): Promise<boolean> {
      const result = db
        .delete(schema.messages)
        .where(eq(schema.messages.id, messageId))
        .run();
      return result.changes > 0;
    },

    async markMessagesCompressed(messageIds: string[]): Promise<number> {
      if (messageIds.length === 0) return 0;
      let total = 0;
      for (const id of messageIds) {
        const result = db
          .update(schema.messages)
          .set({ compressed: true })
          .where(eq(schema.messages.id, id))
          .run();
        total += result.changes;
      }
      return total;
    },

    async searchMessages(query: string, limit: number = 20): Promise<SearchResult[]> {
      const ftsRows = db.all(
        sql`SELECT m.id as msg_id, highlight(messages_fts, 0, '<mark>', '</mark>') as snippet
            FROM messages_fts fts
            JOIN messages m ON m.rowid = fts.rowid
            WHERE messages_fts MATCH ${query}
            LIMIT ${limit}`
      ) as { msg_id: string; snippet: string }[];

      const results: SearchResult[] = [];
      for (const ftsRow of ftsRows) {
        const msgRow = db
          .select()
          .from(schema.messages)
          .where(eq(schema.messages.id, ftsRow.msg_id))
          .get() as MessageRow | undefined;

        if (msgRow) {
          const convRow = db
            .select()
            .from(schema.conversations)
            .where(eq(schema.conversations.id, msgRow.conversationId))
            .get() as ConversationRow | undefined;

          results.push({
            message: msgRow,
            conversationTitle: convRow?.title ?? "Unknown",
            snippet: ftsRow.snippet,
          });
        }
      }

      return results;
    },
  };
}
