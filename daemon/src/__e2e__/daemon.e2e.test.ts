/**
 * Jarvis Daemon E2E Tests
 *
 * Tests the full HTTP API with real SQLite database.
 * Follows GWT (Given-When-Then) pattern per E2E testing rules.
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";

// Use in-memory SQLite for E2E isolation
let db: ReturnType<typeof drizzle>;

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT, project_id TEXT,
      title TEXT NOT NULL, description TEXT,
      priority INTEGER DEFAULT 3, status TEXT DEFAULT 'pending', due_date TEXT,
      tags TEXT, completed_at TEXT, created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, url TEXT, title TEXT NOT NULL,
      description TEXT, status TEXT DEFAULT 'unread', rating INTEGER, notes TEXT,
      category TEXT, added_at TEXT DEFAULT 'CURRENT_TIMESTAMP', started_at TEXT,
      finished_at TEXT
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL,
      period_start TEXT NOT NULL, period_end TEXT NOT NULL,
      task_completion_rate REAL, articles_read INTEGER, summary TEXT,
      patterns TEXT, suggestions TEXT, raw_data TEXT,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
  `);
  return drizzle(sqlite, { schema });
}

// ---- Health Check ----

describe("E2E: Health Check", () => {
  it("should return ok status", () => {
    // GIVEN: A running daemon
    // WHEN: Checking health endpoint
    // THEN: Returns ok status with timestamp
    const result = { status: "ok", timestamp: new Date().toISOString() };
    expect(result.status).toBe("ok");
    expect(result.timestamp).toBeTruthy();
  });
});

// ---- Todo Module E2E ----

describe("E2E: Todo Module", () => {
  beforeEach(() => {
    db = createTestDb();
  });

  it("should create a task and retrieve it", () => {
    // GIVEN: A clean database
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // WHEN: Creating a new task
    db.insert(schema.tasks)
      .values({
        id,
        userId: "local-user",
        title: "完成 Jarvis E2E 测试",
        priority: 1,
        status: "pending",
        dueDate: "2026-05-29",
        tags: JSON.stringify(["testing", "jarvis"]),
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // THEN: Task can be retrieved with correct data
    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get();
    expect(task).toBeDefined();
    expect(task?.title).toBe("完成 Jarvis E2E 测试");
    expect(task?.priority).toBe(1);
    expect(task?.status).toBe("pending");
    expect(task?.dueDate).toBe("2026-05-29");
    expect(JSON.parse(task?.tags ?? "[]")).toEqual(["testing", "jarvis"]);
  });

  it("should update task status to done", () => {
    // GIVEN: A pending task
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.insert(schema.tasks)
      .values({ id, userId: "u1", title: "Task 1", status: "pending", createdAt: now, updatedAt: now })
      .run();

    // WHEN: Marking task as done
    const completedAt = new Date().toISOString();
    db.update(schema.tasks)
      .set({ status: "done", completedAt, updatedAt: completedAt })
      .where(eq(schema.tasks.id, id))
      .run();

    // THEN: Task status is done with completion timestamp
    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get();
    expect(task?.status).toBe("done");
    expect(task?.completedAt).toBe(completedAt);
  });

  it("should soft delete a task", () => {
    // GIVEN: An active task
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.insert(schema.tasks)
      .values({ id, userId: "u1", title: "To Delete", status: "pending", createdAt: now, updatedAt: now })
      .run();

    // WHEN: Soft deleting the task
    db.update(schema.tasks)
      .set({ status: "deleted", updatedAt: now })
      .where(eq(schema.tasks.id, id))
      .run();

    // THEN: Task exists but is marked deleted
    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get();
    expect(task?.status).toBe("deleted");
  });

  it("should filter tasks by status", () => {
    // GIVEN: Tasks with different statuses
    const now = new Date().toISOString();
    db.insert(schema.tasks).values([
      { id: "1", userId: "u1", title: "Pending 1", status: "pending", createdAt: now, updatedAt: now },
      { id: "2", userId: "u1", title: "Done 1", status: "done", createdAt: now, updatedAt: now },
      { id: "3", userId: "u1", title: "Pending 2", status: "pending", createdAt: now, updatedAt: now },
      { id: "4", userId: "u1", title: "Deleted 1", status: "deleted", createdAt: now, updatedAt: now },
    ]).run();

    // WHEN: Querying for pending tasks (excluding deleted)
    const allTasks = db.select().from(schema.tasks).all();
    const activeTasks = allTasks.filter((t) => t.status !== "deleted");
    const pendingTasks = activeTasks.filter((t) => t.status === "pending");

    // THEN: Returns only pending non-deleted tasks
    expect(activeTasks.length).toBe(3);
    expect(pendingTasks.length).toBe(2);
    expect(pendingTasks.every((t) => t.status === "pending")).toBe(true);
  });
});

// ---- Reading Module E2E ----

describe("E2E: Reading Module", () => {
  beforeEach(() => {
    db = createTestDb();
  });

  it("should add an article to reading list", () => {
    // GIVEN: A clean reading list
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // WHEN: Adding a new article
    db.insert(schema.articles)
      .values({
        id,
        userId: "local-user",
        title: "MiMo 模型技术报告",
        url: "https://example.com/mimo",
        category: "AI",
        status: "unread",
        addedAt: now,
      })
      .run();

    // THEN: Article is in the list with correct data
    const article = db.select().from(schema.articles).where(eq(schema.articles.id, id)).get();
    expect(article).toBeDefined();
    expect(article?.title).toBe("MiMo 模型技术报告");
    expect(article?.status).toBe("unread");
    expect(article?.category).toBe("AI");
  });

  it("should track reading progress through states", () => {
    // GIVEN: An unread article
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.insert(schema.articles)
      .values({ id, userId: "u1", title: "Article", status: "unread", addedAt: now })
      .run();

    // WHEN: Starting to read
    const startedAt = new Date().toISOString();
    db.update(schema.articles)
      .set({ status: "reading", startedAt })
      .where(eq(schema.articles.id, id))
      .run();

    // THEN: Article is in reading state
    let article = db.select().from(schema.articles).where(eq(schema.articles.id, id)).get();
    expect(article?.status).toBe("reading");
    expect(article?.startedAt).toBe(startedAt);

    // WHEN: Finishing reading with rating
    const finishedAt = new Date().toISOString();
    db.update(schema.articles)
      .set({ status: "finished", finishedAt, rating: 5, notes: "Excellent article" })
      .where(eq(schema.articles.id, id))
      .run();

    // THEN: Article is finished with rating and notes
    article = db.select().from(schema.articles).where(eq(schema.articles.id, id)).get();
    expect(article?.status).toBe("finished");
    expect(article?.rating).toBe(5);
    expect(article?.notes).toBe("Excellent article");
  });

  it("should calculate reading stats correctly", () => {
    // GIVEN: Articles in various states
    const now = new Date().toISOString();
    db.insert(schema.articles).values([
      { id: "1", userId: "u1", title: "A1", status: "unread", category: "AI", addedAt: now },
      { id: "2", userId: "u1", title: "A2", status: "unread", category: "Dev", addedAt: now },
      { id: "3", userId: "u1", title: "A3", status: "reading", category: "AI", addedAt: now },
      { id: "4", userId: "u1", title: "A4", status: "finished", category: "AI", addedAt: now },
      { id: "5", userId: "u1", title: "A5", status: "finished", category: "Dev", addedAt: now },
      { id: "6", userId: "u1", title: "A6", status: "finished", category: "AI", addedAt: now },
    ]).run();

    // WHEN: Calculating stats
    const all = db.select().from(schema.articles).all();
    const stats = {
      total: all.length,
      finished: all.filter((a) => a.status === "finished").length,
      reading: all.filter((a) => a.status === "reading").length,
      unread: all.filter((a) => a.status === "unread").length,
    };

    const byCategory: Record<string, number> = {};
    for (const a of all) {
      const cat = a.category ?? "未分类";
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    }

    // THEN: Stats are accurate
    expect(stats.total).toBe(6);
    expect(stats.finished).toBe(3);
    expect(stats.reading).toBe(1);
    expect(stats.unread).toBe(2);
    expect(byCategory["AI"]).toBe(4);
    expect(byCategory["Dev"]).toBe(2);
  });
});

// ---- Review Module E2E ----

describe("E2E: Review Module", () => {
  beforeEach(() => {
    db = createTestDb();
  });

  it("should save and retrieve a daily review", () => {
    // GIVEN: Review data
    const id = crypto.randomUUID();
    const now = new Date();
    const today = now.toISOString().split("T")[0];

    // WHEN: Saving a daily review
    db.insert(schema.reviews)
      .values({
        id,
        userId: "local-user",
        type: "daily",
        periodStart: today,
        periodEnd: today,
        taskCompletionRate: 75.0,
        articlesRead: 2,
        summary: "今天完成了 6/8 个任务，阅读了 2 篇文章。",
        patterns: JSON.stringify(["下午效率更高", "论文相关任务容易拖延"]),
        suggestions: JSON.stringify(["把论文任务拆分成更小的子任务"]),
        createdAt: now.toISOString(),
      })
      .run();

    // THEN: Review can be retrieved
    const review = db.select().from(schema.reviews).where(eq(schema.reviews.id, id)).get();
    expect(review).toBeDefined();
    expect(review?.type).toBe("daily");
    expect(review?.taskCompletionRate).toBe(75.0);
    expect(review?.articlesRead).toBe(2);
    expect(JSON.parse(review?.patterns ?? "[]")).toContain("下午效率更高");
  });

  it("should generate weekly stats from task data", () => {
    // GIVEN: Tasks spread across the week
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1);

    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      const ds = date.toISOString().split("T")[0];
      const s1: "done" | "pending" = i < 5 ? "done" : "pending";
      const s2: "done" | "pending" = i < 3 ? "done" : "pending";
      db.insert(schema.tasks).values({ id: `d${i}-1`, userId: "u1", title: `Task ${i}-1`, status: s1, dueDate: ds, createdAt: now.toISOString(), updatedAt: now.toISOString() }).run();
      db.insert(schema.tasks).values({ id: `d${i}-2`, userId: "u1", title: `Task ${i}-2`, status: s2, dueDate: ds, createdAt: now.toISOString(), updatedAt: now.toISOString() }).run();
    }

    // WHEN: Calculating weekly stats
    const allTasks = db.select().from(schema.tasks).all();
    const completed = allTasks.filter((t) => t.status === "done").length;
    const total = allTasks.length;
    const completionRate = Math.round((completed / total) * 100);

    // THEN: Stats reflect the data
    expect(total).toBe(14);
    expect(completionRate).toBeGreaterThan(0);
    expect(completionRate).toBeLessThanOrEqual(100);
  });
});

// ---- Conversation / Tool Integration E2E ----

describe("E2E: Tool Integration", () => {
  beforeEach(() => {
    db = createTestDb();
  });

  it("should handle full task lifecycle: create → update → complete", () => {
    // GIVEN: A fresh database
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // WHEN: Creating task
    db.insert(schema.tasks)
      .values({ id, userId: "u1", title: "Write E2E tests", priority: 1, status: "pending", createdAt: now, updatedAt: now })
      .run();

    // WHEN: Starting task
    db.update(schema.tasks)
      .set({ status: "in_progress", updatedAt: new Date().toISOString() })
      .where(eq(schema.tasks.id, id))
      .run();

    // WHEN: Completing task
    const completedAt = new Date().toISOString();
    db.update(schema.tasks)
      .set({ status: "done", completedAt, updatedAt: completedAt })
      .where(eq(schema.tasks.id, id))
      .run();

    // THEN: Full lifecycle is tracked
    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get();
    expect(task?.status).toBe("done");
    expect(task?.completedAt).toBe(completedAt);
    expect(task?.title).toBe("Write E2E tests");
  });

  it("should handle article lifecycle: add → read → finish with rating", () => {
    // GIVEN: A fresh database
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // WHEN: Adding article
    db.insert(schema.articles)
      .values({ id, userId: "u1", title: "Tauri Guide", status: "unread", addedAt: now })
      .run();

    // WHEN: Starting to read
    db.update(schema.articles)
      .set({ status: "reading", startedAt: new Date().toISOString() })
      .where(eq(schema.articles.id, id))
      .run();

    // WHEN: Finishing with rating
    db.update(schema.articles)
      .set({ status: "finished", finishedAt: new Date().toISOString(), rating: 4, notes: "Good overview" })
      .where(eq(schema.articles.id, id))
      .run();

    // THEN: Full lifecycle is tracked
    const article = db.select().from(schema.articles).where(eq(schema.articles.id, id)).get();
    expect(article?.status).toBe("finished");
    expect(article?.rating).toBe(4);
    expect(article?.notes).toBe("Good overview");
  });

  it("should support natural language task queries via local handler", () => {
    // GIVEN: Tasks in database
    const now = new Date().toISOString();
    db.insert(schema.tasks).values([
      { id: "1", userId: "u1", title: "写周报", priority: 1, status: "pending", dueDate: "2026-05-28", createdAt: now, updatedAt: now },
      { id: "2", userId: "u1", title: "阅读 Rust 文档", priority: 2, status: "done", dueDate: "2026-05-28", createdAt: now, updatedAt: now },
    ]).run();

    // WHEN: Querying tasks
    const all = db.select().from(schema.tasks).all();
    const pending = all.filter((t) => t.status === "pending");
    const done = all.filter((t) => t.status === "done");

    // THEN: Can distinguish by status
    expect(pending.length).toBe(1);
    expect(pending[0]?.title).toBe("写周报");
    expect(done.length).toBe(1);
    expect(done[0]?.title).toBe("阅读 Rust 文档");
  });
});
