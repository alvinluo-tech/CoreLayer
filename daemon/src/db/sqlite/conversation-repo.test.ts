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
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
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
      parent_message_id TEXT,
      token_count INTEGER,
      compressed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content, role, conversation_id, content='messages', content_rowid='rowid'
    );
    CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content, role, conversation_id)
      VALUES (new.rowid, new.content, new.role, new.conversation_id);
    END;
    CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, role, conversation_id)
      VALUES('delete', old.rowid, old.content, old.role, old.conversation_id);
    END;
    CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, role, conversation_id)
      VALUES('delete', old.rowid, old.content, old.role, old.conversation_id);
      INSERT INTO messages_fts(rowid, content, role, conversation_id)
      VALUES (new.rowid, new.content, new.role, new.conversation_id);
    END;
  `);
  return drizzle(sqlite, { schema });
}

const testDb = createTestDb();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rawSqlite = (testDb as any).$client as InstanceType<typeof Database>;

vi.mock("../client.js", () => ({ db: testDb, schema }));

const { createSqliteConversationRepo } = await import("./conversation-repo.js");

describe("Conversation Repository", () => {
  let conversations: ReturnType<typeof createSqliteConversationRepo>;

  beforeEach(() => {
    rawSqlite.exec("DELETE FROM messages");
    rawSqlite.exec("DELETE FROM conversations");
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

  describe("editMessage", () => {
    it("should update message content", async () => {
      const conv = await conversations.create("Edit test");
      const msg = await conversations.addMessage(conv.id, { role: "user", content: "Original" });

      const updated = await conversations.editMessage(conv.id, msg.id, "Edited content");
      expect(updated.content).toBe("Edited content");
      expect(updated.id).toBe(msg.id);
    });

    it("should persist the edit to the database", async () => {
      const conv = await conversations.create("Persist test");
      const msg = await conversations.addMessage(conv.id, { role: "user", content: "Before" });

      await conversations.editMessage(conv.id, msg.id, "After");

      const msgs = await conversations.getMessages(conv.id);
      expect(msgs[0]!.content).toBe("After");
    });

    it("should update the conversation updatedAt timestamp", async () => {
      const conv = await conversations.create("Timestamp test");
      const msg = await conversations.addMessage(conv.id, { role: "user", content: "msg" });
      const originalUpdatedAt = conv.updatedAt;

      await new Promise((r) => setTimeout(r, 10));
      await conversations.editMessage(conv.id, msg.id, "updated");

      const updatedConv = await conversations.getById(conv.id);
      expect(updatedConv!.updatedAt).not.toBe(originalUpdatedAt);
    });
  });

  describe("deleteMessage", () => {
    it("should delete an existing message", async () => {
      const conv = await conversations.create("Delete msg test");
      const msg = await conversations.addMessage(conv.id, { role: "user", content: "Delete me" });

      const result = await conversations.deleteMessage(msg.id);
      expect(result).toBe(true);

      const msgs = await conversations.getMessages(conv.id);
      expect(msgs.length).toBe(0);
    });

    it("should return false for non-existent message", async () => {
      const result = await conversations.deleteMessage("non-existent");
      expect(result).toBe(false);
    });

    it("should not affect other messages in the conversation", async () => {
      const conv = await conversations.create("Partial delete");
      const msg1 = await conversations.addMessage(conv.id, { role: "user", content: "Keep" });
      const msg2 = await conversations.addMessage(conv.id, { role: "assistant", content: "Delete" });

      await conversations.deleteMessage(msg2.id);

      const msgs = await conversations.getMessages(conv.id);
      expect(msgs.length).toBe(1);
      expect(msgs[0]!.id).toBe(msg1.id);
    });
  });

  describe("getMessageBranches", () => {
    it("should return siblings with the same parentMessageId", async () => {
      const conv = await conversations.create("Branch test");
      const parent = await conversations.addMessage(conv.id, { role: "user", content: "Question" });
      const branch1 = await conversations.addMessage(conv.id, {
        role: "assistant",
        content: "Answer 1",
        parentMessageId: parent.id,
      });
      const branch2 = await conversations.addMessage(conv.id, {
        role: "assistant",
        content: "Answer 2",
        parentMessageId: parent.id,
      });

      const branches = await conversations.getMessageBranches(branch1.id);
      expect(branches.length).toBe(2);
      expect(branches.map((b) => b.id).sort()).toEqual([branch1.id, branch2.id].sort());
    });

    it("should return root siblings when message has no parentMessageId", async () => {
      const conv = await conversations.create("Root siblings");
      const msg1 = await conversations.addMessage(conv.id, { role: "user", content: "Q1" });
      const msg2 = await conversations.addMessage(conv.id, { role: "user", content: "Q2" });
      // Add a child to ensure it's not returned
      await conversations.addMessage(conv.id, {
        role: "assistant",
        content: "A1",
        parentMessageId: msg1.id,
      });

      const branches = await conversations.getMessageBranches(msg1.id);
      expect(branches.length).toBe(2);
      expect(branches.map((b) => b.id).sort()).toEqual([msg1.id, msg2.id].sort());
    });

    it("should return empty array for non-existent message", async () => {
      const branches = await conversations.getMessageBranches("non-existent");
      expect(branches).toEqual([]);
    });
  });

  describe("getConversationTree", () => {
    it("should return a flat list for messages without parent", async () => {
      const conv = await conversations.create("Flat tree");
      const msg1 = await conversations.addMessage(conv.id, { role: "user", content: "Q1" });
      const msg2 = await conversations.addMessage(conv.id, { role: "assistant", content: "A1" });

      const tree = await conversations.getConversationTree(conv.id);
      expect(tree.length).toBe(2);
      expect(tree[0]!.message.id).toBe(msg1.id);
      expect(tree[0]!.children.length).toBe(0);
      expect(tree[1]!.message.id).toBe(msg2.id);
    });

    it("should build parent-child relationships", async () => {
      const conv = await conversations.create("Tree structure");
      const parent = await conversations.addMessage(conv.id, { role: "user", content: "Root" });
      const child1 = await conversations.addMessage(conv.id, {
        role: "assistant",
        content: "Branch A",
        parentMessageId: parent.id,
      });
      const child2 = await conversations.addMessage(conv.id, {
        role: "assistant",
        content: "Branch B",
        parentMessageId: parent.id,
      });

      const tree = await conversations.getConversationTree(conv.id);
      expect(tree.length).toBe(1);
      expect(tree[0]!.message.id).toBe(parent.id);
      expect(tree[0]!.children.length).toBe(2);
      expect(tree[0]!.children.map((c) => c.message.id).sort()).toEqual(
        [child1.id, child2.id].sort()
      );
    });

    it("should handle multi-level nesting", async () => {
      const conv = await conversations.create("Deep tree");
      const root = await conversations.addMessage(conv.id, { role: "user", content: "Root" });
      const child = await conversations.addMessage(conv.id, {
        role: "assistant",
        content: "Child",
        parentMessageId: root.id,
      });
      const grandchild = await conversations.addMessage(conv.id, {
        role: "user",
        content: "Grandchild",
        parentMessageId: child.id,
      });

      const tree = await conversations.getConversationTree(conv.id);
      expect(tree.length).toBe(1);
      expect(tree[0]!.children.length).toBe(1);
      expect(tree[0]!.children[0]!.children.length).toBe(1);
      expect(tree[0]!.children[0]!.children[0]!.message.id).toBe(grandchild.id);
    });

    it("should return empty array for conversation with no messages", async () => {
      const conv = await conversations.create("Empty tree");
      const tree = await conversations.getConversationTree(conv.id);
      expect(tree).toEqual([]);
    });
  });

  describe("searchMessages", () => {
    it("should find messages by keyword", async () => {
      const conv = await conversations.create("Search test");
      await conversations.addMessage(conv.id, { role: "user", content: "How to use TypeScript generics" });
      await conversations.addMessage(conv.id, { role: "assistant", content: "Generics allow you to write reusable code" });

      const results = await conversations.searchMessages("TypeScript");
      expect(results.length).toBe(1);
      expect(results[0]!.message.content).toContain("TypeScript");
      expect(results[0]!.conversationTitle).toBe("Search test");
    });

    it("should return highlighted snippets", async () => {
      const conv = await conversations.create("Snippet test");
      await conversations.addMessage(conv.id, { role: "user", content: "The quick brown fox jumps" });

      const results = await conversations.searchMessages("quick");
      expect(results.length).toBe(1);
      expect(results[0]!.snippet).toContain("<mark>");
      expect(results[0]!.snippet).toContain("</mark>");
    });

    it("should respect the limit parameter", async () => {
      const conv = await conversations.create("Limit test");
      for (let i = 0; i < 5; i++) {
        await conversations.addMessage(conv.id, { role: "user", content: `common keyword ${i}` });
      }

      const results = await conversations.searchMessages("common", 2);
      expect(results.length).toBe(2);
    });

    it("should return empty array for no matches", async () => {
      const conv = await conversations.create("No match");
      await conversations.addMessage(conv.id, { role: "user", content: "Hello world" });

      const results = await conversations.searchMessages("nonexistent");
      expect(results).toEqual([]);
    });

    it("should search across multiple conversations", async () => {
      const conv1 = await conversations.create("Conv 1");
      const conv2 = await conversations.create("Conv 2");
      await conversations.addMessage(conv1.id, { role: "user", content: "unique_term_alpha" });
      await conversations.addMessage(conv2.id, { role: "user", content: "unique_term_alpha" });

      const results = await conversations.searchMessages("unique_term_alpha");
      expect(results.length).toBe(2);
    });
  });
});
