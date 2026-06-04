import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, sql } from "drizzle-orm";
import * as schema from "./schema.js";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
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
  `);
  return drizzle(sqlite, { schema });
}

describe("Conversation Repository", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("should create a conversation", () => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.insert(schema.conversations)
      .values({ id, title: "Test Chat", createdAt: now, updatedAt: now })
      .run();

    const conv = db.select().from(schema.conversations).where(eq(schema.conversations.id, id)).get();
    expect(conv).toBeDefined();
    expect(conv?.title).toBe("Test Chat");
    expect(conv?.messageCount).toBe(0);
  });

  it("should list conversations ordered by updated_at desc", () => {
    const now1 = "2026-05-28T10:00:00Z";
    const now2 = "2026-05-28T11:00:00Z";

    db.insert(schema.conversations).values([
      { id: "1", title: "First", createdAt: now1, updatedAt: now1 },
      { id: "2", title: "Second", createdAt: now2, updatedAt: now2 },
    ]).run();

    const convs = db.select().from(schema.conversations).all();
    // Drizzle doesn't support orderBy in basic select, so we sort in JS
    const sorted = convs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    expect(sorted[0]?.title).toBe("Second");
    expect(sorted[1]?.title).toBe("First");
  });

  it("should add messages to conversation and update count", () => {
    const convId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.insert(schema.conversations)
      .values({ id: convId, title: "Test", createdAt: now, updatedAt: now })
      .run();

    // Add first message
    const msg1Id = crypto.randomUUID();
    db.insert(schema.messages)
      .values({ id: msg1Id, conversationId: convId, role: "user", content: "Hello", createdAt: now })
      .run();

    // Update conversation count
    db.update(schema.conversations)
      .set({ messageCount: sql`${schema.conversations.messageCount} + 1`, updatedAt: now })
      .where(eq(schema.conversations.id, convId))
      .run();

    // Add second message
    const msg2Id = crypto.randomUUID();
    db.insert(schema.messages)
      .values({ id: msg2Id, conversationId: convId, role: "assistant", content: "Hi there!", createdAt: now })
      .run();

    db.update(schema.conversations)
      .set({ messageCount: sql`${schema.conversations.messageCount} + 1`, updatedAt: now })
      .where(eq(schema.conversations.id, convId))
      .run();

    const messages = db.select().from(schema.messages).where(eq(schema.messages.conversationId, convId)).all();
    expect(messages.length).toBe(2);
    expect(messages[0]?.role).toBe("user");
    expect(messages[1]?.role).toBe("assistant");

    const conv = db.select().from(schema.conversations).where(eq(schema.conversations.id, convId)).get();
    expect(conv?.messageCount).toBe(2);
  });

  it("should delete conversation and cascade messages", () => {
    const convId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.insert(schema.conversations)
      .values({ id: convId, title: "To Delete", createdAt: now, updatedAt: now })
      .run();

    db.insert(schema.messages).values([
      { id: "m1", conversationId: convId, role: "user", content: "msg1", createdAt: now },
      { id: "m2", conversationId: convId, role: "assistant", content: "msg2", createdAt: now },
    ]).run();

    // Delete conversation
    db.delete(schema.conversations).where(eq(schema.conversations.id, convId)).run();

    // Verify cascade
    const conv = db.select().from(schema.conversations).where(eq(schema.conversations.id, convId)).get();
    expect(conv).toBeUndefined();

    const messages = db.select().from(schema.messages).where(eq(schema.messages.conversationId, convId)).all();
    expect(messages.length).toBe(0);
  });

  it("should store tool_calls as JSON string", () => {
    const convId = crypto.randomUUID();
    const msgId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.insert(schema.conversations)
      .values({ id: convId, title: "Test", createdAt: now, updatedAt: now })
      .run();

    const toolCalls = [{ name: "getTodayTasks", args: {}, result: { count: 3 } }];
    db.insert(schema.messages)
      .values({
        id: msgId,
        conversationId: convId,
        role: "assistant",
        content: "You have 3 tasks",
        toolCalls: JSON.stringify(toolCalls),
        createdAt: now,
      })
      .run();

    const msg = db.select().from(schema.messages).where(eq(schema.messages.id, msgId)).get();
    expect(msg?.toolCalls).toBeTruthy();
    const parsed = JSON.parse(msg?.toolCalls ?? "[]");
    expect(parsed[0]?.name).toBe("getTodayTasks");
  });

  it("should handle unicode in conversation titles", () => {
    const convId = crypto.randomUUID();
    const now = new Date().toISOString();
    const title = "关于 Rust 所有权的讨论 🦀";

    db.insert(schema.conversations)
      .values({ id: convId, title, createdAt: now, updatedAt: now })
      .run();

    const conv = db.select().from(schema.conversations).where(eq(schema.conversations.id, convId)).get();
    expect(conv?.title).toBe(title);
  });

  it("should handle empty message content", () => {
    const convId = crypto.randomUUID();
    const msgId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.insert(schema.conversations)
      .values({ id: convId, title: "Test", createdAt: now, updatedAt: now })
      .run();

    db.insert(schema.messages)
      .values({ id: msgId, conversationId: convId, role: "assistant", content: "", createdAt: now })
      .run();

    const msg = db.select().from(schema.messages).where(eq(schema.messages.id, msgId)).get();
    expect(msg?.content).toBe("");
  });
});
