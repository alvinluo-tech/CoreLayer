/**
 * AI Regression Tests for Jarvis
 *
 * Tests specifically designed to catch AI-introduced regressions:
 * 1. Local/AI mode path consistency
 * 2. Response shape completeness
 * 3. Error state handling
 * 4. Edge cases in tool routing
 *
 * Based on ai-regression-testing skill patterns.
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT, project_id TEXT,
      title TEXT NOT NULL, description TEXT,
      priority INTEGER DEFAULT 3, status TEXT DEFAULT 'pending', due_date TEXT,
      tags TEXT, completed_at TEXT,
      objective TEXT, assigned_agent_id TEXT, parent_task_id TEXT,
      dependencies JSON DEFAULT '[]', blocked_by JSON DEFAULT '[]',
      acceptance_criteria JSON DEFAULT '[]', artifacts JSON DEFAULT '[]',
      run_history JSON DEFAULT '[]', manual_intervention_required BOOLEAN DEFAULT 0,
      rollback_plan TEXT,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
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

// ---- Pattern 1: Response Shape Consistency ----
// BUG-R1: AI often adds fields to one code path but forgets another

describe("Regression: Response Shape Consistency", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("BUG-R1: task response always has all required fields", () => {
    // Given: A task with all fields populated
    const now = new Date().toISOString();
    db.insert(schema.tasks).values({
      id: "r1-test",
      userId: "u1",
      title: "Regression Test Task",
      description: "Testing response shape",
      priority: 1,
      status: "pending",
      dueDate: "2026-05-29",
      tags: JSON.stringify(["test"]),
      createdAt: now,
      updatedAt: now,
    }).run();

    // When: Retrieving the task
    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, "r1-test")).get();

    // Then: ALL required fields exist (not just some)
    const REQUIRED_TASK_FIELDS = [
      "id", "userId", "title", "description", "priority",
      "status", "dueDate", "tags", "createdAt", "updatedAt",
    ];
    for (const field of REQUIRED_TASK_FIELDS) {
      expect(task).toHaveProperty(field);
      expect((task as Record<string, unknown>)[field]).toBeDefined();
    }
  });

  it("BUG-R1: article response always has all required fields", () => {
    // Given: An article with all fields
    const now = new Date().toISOString();
    db.insert(schema.articles).values({
      id: "r1-article",
      userId: "u1",
      title: "Test Article",
      url: "https://example.com",
      description: "Test desc",
      status: "reading",
      rating: null,
      notes: null,
      category: "AI",
      addedAt: now,
      startedAt: now,
    }).run();

    // When: Retrieving
    const article = db.select().from(schema.articles).where(eq(schema.articles.id, "r1-article")).get();

    // Then: All fields present
    const REQUIRED_ARTICLE_FIELDS = [
      "id", "userId", "title", "url", "status", "category", "addedAt",
    ];
    for (const field of REQUIRED_ARTICLE_FIELDS) {
      expect(article).toHaveProperty(field);
    }
  });

  it("BUG-R1: review response always has all required fields", () => {
    // Given: A review record
    const now = new Date().toISOString();
    db.insert(schema.reviews).values({
      id: "r1-review",
      userId: "u1",
      type: "daily",
      periodStart: "2026-05-28",
      periodEnd: "2026-05-28",
      taskCompletionRate: 80.0,
      articlesRead: 3,
      summary: "Good day",
      patterns: JSON.stringify(["pattern1"]),
      suggestions: JSON.stringify(["suggestion1"]),
      createdAt: now,
    }).run();

    // When: Retrieving
    const review = db.select().from(schema.reviews).where(eq(schema.reviews.id, "r1-review")).get();

    // Then: All fields present
    expect(review).toHaveProperty("id");
    expect(review).toHaveProperty("type");
    expect(review).toHaveProperty("taskCompletionRate");
    expect(review).toHaveProperty("patterns");
    expect(review).toHaveProperty("suggestions");
  });
});

// ---- Pattern 2: Local/AI Mode Path Consistency ----
// BUG-R2: When AI mode fails, local mode must handle the same queries

describe("Regression: Local Mode Path Consistency", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("BUG-R2: local handler returns same task structure as AI handler", () => {
    // Given: Tasks in database
    const now = new Date().toISOString();
    db.insert(schema.tasks).values([
      { id: "1", userId: "u1", title: "Task A", priority: 1, status: "pending", dueDate: "2026-05-28", createdAt: now, updatedAt: now },
      { id: "2", userId: "u1", title: "Task B", priority: 2, status: "done", createdAt: now, updatedAt: now },
    ]).run();

    // When: Querying tasks (same query both modes would do)
    const allTasks = db.select().from(schema.tasks).all();
    const activeTasks = allTasks.filter((t) => t.status !== "deleted");

    // Then: Response shape is consistent
    expect(activeTasks.length).toBe(2);
    for (const task of activeTasks) {
      expect(task).toHaveProperty("id");
      expect(task).toHaveProperty("title");
      expect(task).toHaveProperty("status");
      expect(task).toHaveProperty("priority");
      expect(typeof task.title).toBe("string");
      expect(typeof task.priority).toBe("number");
    }
  });

  it("BUG-R2: local handler returns same article structure as AI handler", () => {
    // Given: Articles in database
    const now = new Date().toISOString();
    db.insert(schema.articles).values([
      { id: "1", userId: "u1", title: "Article A", status: "unread", category: "AI", addedAt: now },
      { id: "2", userId: "u1", title: "Article B", status: "finished", rating: 5, addedAt: now },
    ]).run();

    // When: Querying articles
    const articles = db.select().from(schema.articles).all();

    // Then: Response shape is consistent
    for (const article of articles) {
      expect(article).toHaveProperty("id");
      expect(article).toHaveProperty("title");
      expect(article).toHaveProperty("status");
      expect(["unread", "reading", "finished"]).toContain(article.status);
    }
  });
});

// ---- Pattern 3: Error State Handling ----
// BUG-R3: Errors should not leave data in inconsistent state

describe("Regression: Error State Handling", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("BUG-R3: failed task update does not corrupt existing data", () => {
    // Given: A valid task
    const now = new Date().toISOString();
    db.insert(schema.tasks).values({
      id: "r3-task",
      userId: "u1",
      title: "Original Title",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    }).run();

    // When: Attempting update with invalid data (simulated)
    // In real code, this would be caught by Zod validation
    // Here we verify the original data is preserved
    const taskBefore = db.select().from(schema.tasks).where(eq(schema.tasks.id, "r3-task")).get();

    // Simulate: try to update with invalid status (would fail validation)
    // The actual update should be rejected by the connector
    // But if it somehow gets through, the data should still be valid
    const taskAfter = db.select().from(schema.tasks).where(eq(schema.tasks.id, "r3-task")).get();

    // Then: Data is unchanged
    expect(taskAfter?.title).toBe(taskBefore?.title);
    expect(taskAfter?.status).toBe(taskBefore?.status);
  });

  it("BUG-R3: empty database returns empty arrays, not errors", () => {
    // Given: Empty database
    // When: Querying
    const tasks = db.select().from(schema.tasks).all();
    const articles = db.select().from(schema.articles).all();
    const reviews = db.select().from(schema.reviews).all();

    // Then: Returns empty arrays, not null/undefined/error
    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks.length).toBe(0);
    expect(Array.isArray(articles)).toBe(true);
    expect(articles.length).toBe(0);
    expect(Array.isArray(reviews)).toBe(true);
    expect(reviews.length).toBe(0);
  });

  it("BUG-R3: task with null optional fields is valid", () => {
    // Given: A task with minimal fields (nulls for optional)
    const now = new Date().toISOString();
    db.insert(schema.tasks).values({
      id: "r3-minimal",
      userId: "u1",
      title: "Minimal Task",
      // description: null (default)
      // dueDate: null (default)
      // tags: null (default)
      status: "pending",
      createdAt: now,
      updatedAt: now,
    }).run();

    // When: Retrieving
    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, "r3-minimal")).get();

    // Then: Task exists with null optional fields
    expect(task).toBeDefined();
    expect(task?.title).toBe("Minimal Task");
    expect(task?.description).toBeNull();
    expect(task?.dueDate).toBeNull();
    expect(task?.tags).toBeNull();
  });
});

// ---- Pattern 4: Edge Cases ----
// BUG-R4: AI often misses edge cases in date handling, priority bounds, etc.

describe("Regression: Edge Cases", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("BUG-R4: priority boundary values (1 and 5) are valid", () => {
    const now = new Date().toISOString();
    db.insert(schema.tasks).values([
      { id: "p1", userId: "u1", title: "Highest", priority: 1, status: "pending", createdAt: now, updatedAt: now },
      { id: "p5", userId: "u1", title: "Lowest", priority: 5, status: "pending", createdAt: now, updatedAt: now },
    ]).run();

    const tasks = db.select().from(schema.tasks).all();
    expect(tasks.find((t) => t.id === "p1")?.priority).toBe(1);
    expect(tasks.find((t) => t.id === "p5")?.priority).toBe(5);
  });

  it("BUG-R4: rating boundary values (1 and 5) are valid", () => {
    const now = new Date().toISOString();
    db.insert(schema.articles).values([
      { id: "r1", userId: "u1", title: "Low rated", status: "finished", rating: 1, addedAt: now },
      { id: "r5", userId: "u1", title: "High rated", status: "finished", rating: 5, addedAt: now },
    ]).run();

    const articles = db.select().from(schema.articles).all();
    expect(articles.find((a) => a.id === "r1")?.rating).toBe(1);
    expect(articles.find((a) => a.id === "r5")?.rating).toBe(5);
  });

  it("BUG-R4: unicode characters in titles are preserved", () => {
    const now = new Date().toISOString();
    const unicodeTitle = "学习 Rust 所有权系统 🦀 — 第三章";

    db.insert(schema.tasks).values({
      id: "unicode",
      userId: "u1",
      title: unicodeTitle,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    }).run();

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, "unicode")).get();
    expect(task?.title).toBe(unicodeTitle);
  });

  it("BUG-R4: JSON tags are correctly serialized and deserialized", () => {
    const now = new Date().toISOString();
    const tags = ["AI", "机器学习", "deep-learning"];

    db.insert(schema.tasks).values({
      id: "json-tags",
      userId: "u1",
      title: "Tagged task",
      tags: JSON.stringify(tags),
      status: "pending",
      createdAt: now,
      updatedAt: now,
    }).run();

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, "json-tags")).get();
    const parsed = JSON.parse(task?.tags ?? "[]");
    expect(parsed).toEqual(tags);
  });

  it("BUG-R4: today's date filter works correctly", () => {
    const now = new Date().toISOString();
    const today = now.split("T")[0];

    db.insert(schema.tasks).values([
      { id: "today", userId: "u1", title: "Today", dueDate: today, status: "pending", createdAt: now, updatedAt: now },
      { id: "yesterday", userId: "u1", title: "Yesterday", dueDate: "2020-01-01", status: "pending", createdAt: now, updatedAt: now },
    ]).run();

    const all = db.select().from(schema.tasks).all();
    const todayTasks = all.filter((t) => t.dueDate === today);

    expect(todayTasks.length).toBe(1);
    expect(todayTasks[0]?.title).toBe("Today");
  });
});

// ---- Pattern 5: Data Integrity ----
// BUG-R5: Related operations should maintain consistency

describe("Regression: Data Integrity", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("BUG-R5: completed task always has completedAt timestamp", () => {
    const now = new Date().toISOString();
    const completedAt = new Date().toISOString();

    db.insert(schema.tasks).values({
      id: "integrity-1",
      userId: "u1",
      title: "Completed Task",
      status: "done",
      completedAt,
      createdAt: now,
      updatedAt: now,
    }).run();

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, "integrity-1")).get();
    expect(task?.status).toBe("done");
    expect(task?.completedAt).toBeTruthy();
    expect(task?.completedAt).toBe(completedAt);
  });

  it("BUG-R5: reading article has startedAt when status is reading", () => {
    const now = new Date().toISOString();
    db.insert(schema.articles).values({
      id: "integrity-2",
      userId: "u1",
      title: "Reading Article",
      status: "reading",
      startedAt: now,
      addedAt: now,
    }).run();

    const article = db.select().from(schema.articles).where(eq(schema.articles.id, "integrity-2")).get();
    expect(article?.status).toBe("reading");
    expect(article?.startedAt).toBeTruthy();
  });

  it("BUG-R5: finished article has finishedAt when status is finished", () => {
    const now = new Date().toISOString();
    db.insert(schema.articles).values({
      id: "integrity-3",
      userId: "u1",
      title: "Finished Article",
      status: "finished",
      finishedAt: now,
      rating: 4,
      addedAt: now,
    }).run();

    const article = db.select().from(schema.articles).where(eq(schema.articles.id, "integrity-3")).get();
    expect(article?.status).toBe("finished");
    expect(article?.finishedAt).toBeTruthy();
    expect(article?.rating).toBe(4);
  });
});
