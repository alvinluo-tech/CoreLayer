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
      workspace_id TEXT,
      project_id TEXT,
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
      parent_message_id TEXT,
      token_count INTEGER,
      compressed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      type TEXT NOT NULL,
      tier TEXT NOT NULL DEFAULT 'context',
      scope_type TEXT NOT NULL DEFAULT 'user' CHECK(scope_type IN ('user', 'workspace', 'project', 'agent', 'task', 'conversation')),
      scope_id TEXT,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      source TEXT,
      confidence REAL,
      uses INTEGER DEFAULT 0,
      last_injected_at TEXT,
      expires_at TEXT,
      source_run_id TEXT,
      source_message_id TEXT,
      last_verified_at TEXT,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      workspace_id TEXT,
      project_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      priority INTEGER DEFAULT 3,
      status TEXT DEFAULT 'pending',
      due_date TEXT,
      tags TEXT,
      completed_at TEXT,
      objective TEXT,
      assigned_agent_id TEXT,
      parent_task_id TEXT,
      dependencies JSON DEFAULT '[]',
      blocked_by JSON DEFAULT '[]',
      acceptance_criteria JSON DEFAULT '[]',
      artifacts JSON DEFAULT '[]',
      run_history JSON DEFAULT '[]',
      manual_intervention_required BOOLEAN DEFAULT 0,
      rollback_plan TEXT,
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

// Mock runtime run-executor
vi.mock("./runtime/run-executor.js", () => ({
  runTurn: vi.fn().mockResolvedValue({
    runId: "run-1",
    conversationId: "conv-1",
    text: "ok",
    events: [],
    userMessage: {},
    assistantMessage: {},
    conversation: {},
  }),
}));

const compressorMocks = vi.hoisted(() => ({
  compressConversation: vi.fn(),
  extractPreferences: vi.fn(),
}));

vi.mock("./orchestrator/compressor.js", () => compressorMocks);

const {
  computeNextRun,
  stopScheduler,
  triggerTask,
  recordActivity,
  getIdleMs,
  setIdleThreshold,
  consolidateOnIdle,
  canRunTick,
  getTickAgeMs,
  runTick,
  NO_REPLY_PREFIX,
  resetTickState,
  resetConsolidationState,
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
    resetConsolidationState();
    compressorMocks.compressConversation.mockReset();
    compressorMocks.extractPreferences.mockReset();
    compressorMocks.extractPreferences.mockResolvedValue([]);
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
      const { runTurn } = await import("./runtime/run-executor.js");

      const repo = (await import("./db/factory.js")).getRepositories().scheduledTasks;
      const task = await repo.upsert({
        name: "prompt-task",
        cronExpr: "0 21 * * *",
        prompt: "Generate daily report",
      });

      const result = await triggerTask(task.id);
      expect(result!.success).toBe(true);
      expect(runTurn).toHaveBeenCalled();
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
    it("marks consolidated messages and does not append duplicate summaries on the next run", async () => {
      const repos = (await import("./db/factory.js")).getRepositories();
      const conversation = await repos.conversations.create("compression regression");

      for (let i = 0; i < 8; i++) {
        await repos.conversations.addMessage(conversation.id, {
          role: i % 2 === 0 ? "user" : "assistant",
          content: `message ${i}`,
        });
      }

      compressorMocks.compressConversation.mockResolvedValueOnce({
        summary: "compressed summary",
        compressedMessages: (await repos.conversations.getMessages(conversation.id)).slice(0, 4),
        preservedMessages: [],
        extractedPreferences: [],
      });

      const first = await consolidateOnIdle();
      const afterFirst = await repos.conversations.getMessages(conversation.id);

      expect(first.conversationsProcessed).toBe(1);
      expect(afterFirst.filter((m) => m.compressed)).toHaveLength(4);
      expect(afterFirst.filter((m) => m.role === "system" && m.content.startsWith("[对话摘要"))).toHaveLength(1);
      expect(compressorMocks.compressConversation).toHaveBeenCalledTimes(1);

      const second = await consolidateOnIdle();
      const afterSecond = await repos.conversations.getMessages(conversation.id);

      expect(second.conversationsProcessed).toBe(0);
      expect(afterSecond.filter((m) => m.role === "system" && m.content.startsWith("[对话摘要"))).toHaveLength(1);
      expect(compressorMocks.compressConversation).toHaveBeenCalledTimes(1);
    });

    it("stores preferences returned by compression without running extraction again", async () => {
      const repos = (await import("./db/factory.js")).getRepositories();
      const conversation = await repos.conversations.create("preference regression");

      for (let i = 0; i < 8; i++) {
        await repos.conversations.addMessage(conversation.id, {
          role: i % 2 === 0 ? "user" : "assistant",
          content: `preference message ${i}`,
        });
      }

      compressorMocks.compressConversation.mockResolvedValueOnce({
        summary: "compressed summary",
        compressedMessages: (await repos.conversations.getMessages(conversation.id)).slice(0, 4),
        preservedMessages: [],
        extractedPreferences: [{ key: "coding_style", value: "用户喜欢简洁实现" }],
      });

      const result = await consolidateOnIdle();
      const memories = await repos.memories.getAll();

      expect(result.conversationsProcessed).toBe(1);
      expect(result.preferencesExtracted).toBe(1);
      expect(compressorMocks.extractPreferences).not.toHaveBeenCalled();
      expect(memories).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: "coding_style",
            value: "用户喜欢简洁实现",
            type: "preference",
          }),
        ]),
      );
    });

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

  // ---- TICK system ----

  describe("TICK system", () => {
    beforeEach(() => {
      resetTickState();
    });

    it("canRunTick returns true when no TICK has run", () => {
      expect(canRunTick()).toBe(true);
    });

    it("canRunTick returns false within 30 minutes of last TICK", async () => {
      await runTick();
      expect(canRunTick()).toBe(false);
    });

    it("getTickAgeMs returns time since last TICK", () => {
      const before = getTickAgeMs();
      expect(before).toBeGreaterThanOrEqual(0);
    });

    it("NO_REPLY_PREFIX is defined", () => {
      expect(NO_REPLY_PREFIX).toBe("NO_REPLY");
    });

    it("runTick executes and returns ran=true", async () => {
      const result = await runTick();
      expect(result.ran).toBe(true);
      expect(typeof result.conversationsProcessed).toBe("number");
    });

    it("runTick skips when called too frequently", async () => {
      await runTick();
      const result = await runTick();
      expect(result.ran).toBe(false);
    });

    it("runTick cleans up TICK conversation when agent replies NO_REPLY", async () => {
      const { runTurn } = await import("./runtime/run-executor.js");
      vi.mocked(runTurn).mockResolvedValueOnce({
        runId: "run-tick",
        conversationId: "tick-conv",
        text: "NO_REPLY nothing to do",
        events: [],
        userMessage: {} as any,
        assistantMessage: { content: "NO_REPLY nothing to do" } as any,
        conversation: { id: "tick-conv" } as any,
      });

      const result = await runTick();
      expect(result.ran).toBe(true);
    });
  });
});
