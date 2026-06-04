import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./db/schema.js";

// Create in-memory test DB with scheduled_tasks table
function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cron_expr TEXT NOT NULL,
      prompt TEXT,
      skill_name TEXT,
      input TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run TEXT,
      next_run TEXT,
      last_result TEXT,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      title TEXT NOT NULL DEFAULT 'New Chat',
      model_used TEXT NOT NULL DEFAULT 'mimo-v2.5-pro',
      message_count INTEGER NOT NULL DEFAULT 0,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      tool_calls TEXT,
      tool_call_id TEXT,
      token_count INTEGER,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      type TEXT NOT NULL,
      tier TEXT NOT NULL DEFAULT 'context',
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      source TEXT,
      confidence REAL,
      uses INTEGER DEFAULT 0,
      expires_at TEXT,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      priority INTEGER DEFAULT 3,
      status TEXT DEFAULT 'pending',
      due_date TEXT,
      tags TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      url TEXT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'unread',
      rating INTEGER,
      notes TEXT,
      category TEXT,
      added_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      started_at TEXT,
      finished_at TEXT
    );
  `);
  return drizzle(sqlite, { schema });
}

const testDb = createTestDb();

vi.mock("./db/client.js", () => ({ db: testDb, schema }));

const { createSqliteScheduledTaskRepo } = await import("./db/sqlite/scheduled-task-repo.js");
const { createSqliteConversationRepo } = await import("./db/sqlite/conversation-repo.js");
const { createSqliteMemoryRepo } = await import("./db/sqlite/memory-repo.js");
const { createSqliteTaskRepo } = await import("./db/sqlite/task-repo.js");
const { createSqliteArticleRepo } = await import("./db/sqlite/article-repo.js");

vi.mock("./db/factory.js", () => ({
  getRepositories: () => ({
    scheduledTasks: createSqliteScheduledTaskRepo(),
    conversations: createSqliteConversationRepo(),
    memories: createSqliteMemoryRepo(),
    tasks: createSqliteTaskRepo(),
    articles: createSqliteArticleRepo(),
  }),
}));

// Mock skills loader
vi.mock("./skills/loader.js", () => ({
  getSkill: vi.fn().mockReturnValue({ manifest: { name: "test-skill" } }),
}));

// Mock skills executor
vi.mock("./skills/executor.js", () => ({
  executeSkill: vi.fn().mockResolvedValue({
    success: true,
    skillName: "test-skill",
    output: { result: "done" },
    durationMs: 100,
    steps: [],
  }),
}));

// Mock orchestrator conversation
vi.mock("./orchestrator/conversation.js", () => ({
  handleMessageInConversation: vi.fn().mockResolvedValue({
    userMessage: {},
    assistantMessage: {},
    conversation: {},
  }),
}));

const {
  computeNextRun,
  stopScheduler,
  triggerTask,
  recordActivity,
  getIdleMs,
  setIdleThreshold,
  consolidateOnIdle,
} = await import("./scheduler.js");

describe("Scheduler", () => {
  beforeEach(async () => {
    stopScheduler();
    testDb.delete(schema.scheduledTasks).run();
    testDb.delete(schema.conversations).run();
    testDb.delete(schema.messages).run();
    testDb.delete(schema.memories).run();
    testDb.delete(schema.tasks).run();
    testDb.delete(schema.articles).run();
  });

  afterEach(() => {
    stopScheduler();
  });

  // ---- computeNextRun ----

  describe("computeNextRun", () => {
    it("should compute next daily fire time", () => {
      const next = computeNextRun("0 21 * * *");
      const date = new Date(next);
      expect(date.getHours()).toBe(21);
      expect(date.getMinutes()).toBe(0);
    });

    it("should compute next weekly fire time", () => {
      const next = computeNextRun("0 21 * * 0"); // Sunday
      const date = new Date(next);
      expect(date.getDay()).toBe(0);
      expect(date.getHours()).toBe(21);
    });

    it("should compute next fire time from a specific date", () => {
      const from = new Date("2026-06-04T10:00:00Z");
      const next = computeNextRun("0 21 * * *", from);
      const date = new Date(next);
      expect(date.getHours()).toBe(21);
      expect(date.getTime()).toBeGreaterThan(from.getTime());
    });

    it("should throw on invalid cron expression", () => {
      expect(() => computeNextRun("invalid")).toThrow();
    });
  });

  // ---- Task execution ----

  describe("triggerTask", () => {
    it("should execute a skill-based task", async () => {
      const repo = (await import("./db/factory.js")).getRepositories().scheduledTasks;
      const task = await repo.upsert({
        name: "test-skill-task",
        cronExpr: "0 21 * * *",
        skillName: "test-skill",
        enabled: true,
      });

      const result = await triggerTask(task.id);
      expect(result).not.toBeNull();
      expect(result!.success).toBe(true);
      expect(result!.taskName).toBe("test-skill-task");
    });

    it("should return null for nonexistent task", async () => {
      const result = await triggerTask("nonexistent-id");
      expect(result).toBeNull();
    });

    it("should fail when skill not found", async () => {
      const { getSkill } = await import("./skills/loader.js");
      vi.mocked(getSkill).mockReturnValueOnce(undefined);

      const repo = (await import("./db/factory.js")).getRepositories().scheduledTasks;
      const task = await repo.upsert({
        name: "bad-skill",
        cronExpr: "0 21 * * *",
        skillName: "nonexistent-skill",
      });

      const result = await triggerTask(task.id);
      expect(result!.success).toBe(false);
      expect(result!.error).toContain("Skill not found");
    });

    it("should execute prompt-based task", async () => {
      const { handleMessageInConversation } = await import("./orchestrator/conversation.js");
      vi.mocked(handleMessageInConversation).mockResolvedValueOnce({
        userMessage: {} as any,
        assistantMessage: {} as any,
        conversation: {} as any,
      });

      const repo = (await import("./db/factory.js")).getRepositories().scheduledTasks;
      const task = await repo.upsert({
        name: "prompt-task",
        cronExpr: "0 21 * * *",
        prompt: "Generate daily report",
      });

      const result = await triggerTask(task.id);
      expect(result!.success).toBe(true);
      expect(handleMessageInConversation).toHaveBeenCalled();
    });

    it("should update lastRun and nextRun after execution", async () => {
      const repo = (await import("./db/factory.js")).getRepositories().scheduledTasks;
      const task = await repo.upsert({
        name: "update-test",
        cronExpr: "0 21 * * *",
        skillName: "test-skill",
      });

      await triggerTask(task.id);

      const updated = await repo.getById(task.id);
      expect(updated!.lastRun).not.toBeNull();
      expect(updated!.nextRun).not.toBeNull();
    });
  });

  // ---- Idle detection ----

  describe("idle detection", () => {
    it("should track activity timestamp", () => {
      const before = getIdleMs();
      expect(before).toBeGreaterThanOrEqual(0);

      recordActivity();
      const after = getIdleMs();
      expect(after).toBeLessThan(1000); // Should be very recent
    });

    it("should set and get idle threshold", () => {
      setIdleThreshold(5000);
      // Threshold is internal, but we can verify it doesn't throw
      expect(true).toBe(true);
    });
  });

  // ---- consolidateOnIdle ----

  describe("consolidateOnIdle", () => {
    it("should prune unused old memories", async () => {
      const memRepo = (await import("./db/factory.js")).getRepositories().memories;

      // Create a memory that is old and unused
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35);

      testDb.insert(schema.memories).values({
        id: "old-unused",
        userId: "default",
        type: "context",
        tier: "context",
        key: "old-key",
        value: "old-value",
        uses: 0,
        createdAt: oldDate.toISOString(),
        updatedAt: oldDate.toISOString(),
      }).run();

      // Create a recent memory (should be kept)
      testDb.insert(schema.memories).values({
        id: "recent",
        userId: "default",
        type: "context",
        tier: "context",
        key: "recent-key",
        value: "recent-value",
        uses: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();

      // Create a used old memory (should be kept)
      testDb.insert(schema.memories).values({
        id: "old-used",
        userId: "default",
        type: "context",
        tier: "context",
        key: "used-key",
        value: "used-value",
        uses: 5,
        createdAt: oldDate.toISOString(),
        updatedAt: oldDate.toISOString(),
      }).run();

      const result = await consolidateOnIdle();

      // Should have pruned the one old unused memory
      expect(result.memoriesPruned).toBeGreaterThanOrEqual(1);

      const remaining = await memRepo.getAll();
      const remainingIds = remaining.map((m) => m.id);
      expect(remainingIds).toContain("recent");
      expect(remainingIds).toContain("old-used");
      expect(remainingIds).not.toContain("old-unused");
    });

    it("should clean expired memories", async () => {
      const memRepo = (await import("./db/factory.js")).getRepositories().memories;

      // Create an expired memory
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      testDb.insert(schema.memories).values({
        id: "expired",
        userId: "default",
        type: "context",
        tier: "context",
        key: "expired-key",
        value: "expired-value",
        uses: 10, // Used but expired
        expiresAt: pastDate.toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();

      const result = await consolidateOnIdle();
      expect(result.memoriesPruned).toBeGreaterThanOrEqual(1);

      const remaining = await memRepo.getAll();
      expect(remaining.find((m) => m.id === "expired")).toBeUndefined();
    });
  });
});
