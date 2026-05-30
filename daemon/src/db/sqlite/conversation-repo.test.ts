import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../schema.js";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      title TEXT NOT NULL DEFAULT 'New Chat',
      model_used TEXT NOT NULL DEFAULT 'mimo-v2.5-pro',
      message_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
      content TEXT NOT NULL DEFAULT '',
      tool_calls TEXT,
      tool_call_id TEXT,
      token_count INTEGER,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
  `);
  return drizzle(sqlite, { schema });
}

const testDb = createTestDb();

vi.mock("../client.js", () => ({ db: testDb, schema }));

const { createSqliteConversationRepo } = await import("./conversation-repo.js");

describe("Conversation Repository", () => {
  let conversations: ReturnType<typeof createSqliteConversationRepo>;

  beforeEach(() => {
    // Delete messages first due to FK constraint
    testDb.delete(schema.messages).run();
    testDb.delete(schema.conversations).run();
    conversations = createSqliteConversationRepo();
  });

  describe("create", () => {
    it("should create a conversation with default title", async () => {
      const conv = await conversations.create();
      expect(conv.id).toBeDefined();
      expect(conv.title).toBe("New Chat");
      expect(conv.userId).toBe("default");
      expect(conv.modelUsed).toBe("mimo-v2.5-pro");
      expect(conv.messageCount).toBe(0);
      expect(conv.createdAt).toBeDefined();
      expect(conv.updatedAt).toBeDefined();
    });

    it("should create a conversation with custom title", async () => {
      const conv = await conversations.create("My Custom Chat");
      expect(conv.title).toBe("My Custom Chat");
    });
  });

  describe("list", () => {
    it("should return conversations in descending order by updatedAt", async () => {
      const conv1 = await conversations.create("First");
      await new Promise((r) => setTimeout(r, 10));
      const conv2 = await conversations.create("Second");

      const list = await conversations.list();
      expect(list.length).toBe(2);
      expect(list[0]!.id).toBe(conv2.id);
      expect(list[1]!.id).toBe(conv1.id);
    });

    it("should return empty array when no conversations exist", async () => {
      const list = await conversations.list();
      expect(list).toEqual([]);
    });
  });

  describe("getById", () => {
    it("should return an existing conversation", async () => {
      const created = await conversations.create("Find me");
      const found = await conversations.getById(created.id);
      expect(found).not.toBeNull();
      expect(found!.title).toBe("Find me");
    });

    it("should return null for non-existent id", async () => {
      const found = await conversations.getById("non-existent");
      expect(found).toBeNull();
    });
  });

  describe("update", () => {
    it("should update the title", async () => {
      const conv = await conversations.create("Old title");
      const updated = await conversations.update(conv.id, { title: "New title" });
      expect(updated.title).toBe("New title");
    });

    it("should update the updatedAt timestamp", async () => {
      const conv = await conversations.create("Timestamp test");
      const originalUpdatedAt = conv.updatedAt;
      await new Promise((r) => setTimeout(r, 10));
      const updated = await conversations.update(conv.id, { title: "Updated" });
      expect(updated.updatedAt).not.toBe(originalUpdatedAt);
    });
  });

  describe("delete", () => {
    it("should delete a conversation", async () => {
      const conv = await conversations.create("Delete me");
      const result = await conversations.delete(conv.id);
      expect(result).toBe(true);

      const found = await conversations.getById(conv.id);
      expect(found).toBeNull();
    });

    it("should cascade delete messages", async () => {
      const conv = await conversations.create("With messages");
      await conversations.addMessage(conv.id, { role: "user", content: "Hello" });
      await conversations.addMessage(conv.id, { role: "assistant", content: "Hi!" });

      const msgsBefore = await conversations.getMessages(conv.id);
      expect(msgsBefore.length).toBe(2);

      await conversations.delete(conv.id);

      const msgsAfter = await conversations.getMessages(conv.id);
      expect(msgsAfter.length).toBe(0);
    });

    it("should return false for non-existent id", async () => {
      const result = await conversations.delete("non-existent");
      expect(result).toBe(false);
    });
  });

  describe("addMessage", () => {
    it("should insert a message and increment messageCount", async () => {
      const conv = await conversations.create("Chat");
      expect(conv.messageCount).toBe(0);

      const msg = await conversations.addMessage(conv.id, {
        role: "user",
        content: "Hello",
      });
      expect(msg.id).toBeDefined();
      expect(msg.conversationId).toBe(conv.id);
      expect(msg.role).toBe("user");
      expect(msg.content).toBe("Hello");
      expect(msg.createdAt).toBeDefined();

      const updated = await conversations.getById(conv.id);
      expect(updated!.messageCount).toBe(1);
    });

    it("should increment messageCount on each addMessage call", async () => {
      const conv = await conversations.create("Counter test");
      await conversations.addMessage(conv.id, { role: "user", content: "msg1" });
      await conversations.addMessage(conv.id, { role: "assistant", content: "msg2" });
      await conversations.addMessage(conv.id, { role: "user", content: "msg3" });

      const updated = await conversations.getById(conv.id);
      expect(updated!.messageCount).toBe(3);
    });

    it("should store tool-related fields", async () => {
      const conv = await conversations.create("Tool test");
      const msg = await conversations.addMessage(conv.id, {
        role: "tool",
        content: "Result",
        toolCallId: "call-123",
        tokenCount: 42,
      });
      expect(msg.toolCallId).toBe("call-123");
      expect(msg.tokenCount).toBe(42);
    });

    it("should store toolCalls JSON", async () => {
      const conv = await conversations.create("ToolCalls test");
      const msg = await conversations.addMessage(conv.id, {
        role: "assistant",
        content: "Calling tools",
        toolCalls: '[{"name":"search","args":{"q":"test"}}]',
      });
      expect(msg.toolCalls).toBe('[{"name":"search","args":{"q":"test"}}]');
    });
  });

  describe("getMessages", () => {
    it("should return all messages for a conversation", async () => {
      const conv = await conversations.create("Messages test");
      await conversations.addMessage(conv.id, { role: "user", content: "Hello" });
      await conversations.addMessage(conv.id, { role: "assistant", content: "Hi!" });

      const messages = await conversations.getMessages(conv.id);
      expect(messages.length).toBe(2);
      expect(messages[0]!.role).toBe("user");
      expect(messages[1]!.role).toBe("assistant");
    });

    it("should return empty array for conversation with no messages", async () => {
      const conv = await conversations.create("Empty");
      const messages = await conversations.getMessages(conv.id);
      expect(messages).toEqual([]);
    });

    it("should return empty array for non-existent conversation", async () => {
      const messages = await conversations.getMessages("non-existent");
      expect(messages).toEqual([]);
    });
  });
});
