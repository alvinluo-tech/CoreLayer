import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "../../schema.js";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
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
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      task_completion_rate REAL,
      articles_read INTEGER,
      summary TEXT,
      patterns TEXT,
      suggestions TEXT,
      raw_data TEXT,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
  `);
  return drizzle(sqlite, { schema });
}

const testDb = createTestDb();

vi.mock("../../client.js", () => ({ db: testDb, schema }));

const { createSqliteReviewRepo } = await import("../review-repo.js");

describe("Review Repository", () => {
  let reviews: ReturnType<typeof createSqliteReviewRepo>;

  beforeEach(() => {
    testDb.delete(schema.reviews).run();
    testDb.delete(schema.tasks).run();
    testDb.delete(schema.articles).run();
    reviews = createSqliteReviewRepo();
  });

  describe("save", () => {
    it("should save a daily review with correct period dates", async () => {
      const review = await reviews.save({
        type: "daily",
        summary: "Productive day",
        patterns: ["morning focus", "afternoon slump"],
        suggestions: ["take more breaks"],
      });
      expect(review.id).toBeDefined();
      expect(review.type).toBe("daily");
      expect(review.summary).toBe("Productive day");
      expect(review.patterns).toEqual(["morning focus", "afternoon slump"]);
      expect(review.suggestions).toEqual(["take more breaks"]);
      // Daily periodStart and periodEnd should be today's date
      const today = new Date().toISOString().split("T")[0];
      expect(review.periodStart).toBe(today);
      expect(review.periodEnd).toBe(today);
    });

    it("should save a weekly review with correct period dates", async () => {
      const review = await reviews.save({
        type: "weekly",
        summary: "Good week overall",
        patterns: ["consistent mornings"],
      });
      expect(review.id).toBeDefined();
      expect(review.type).toBe("weekly");
      expect(review.periodStart).toBeDefined();
      expect(review.periodEnd).toBeDefined();
      // Period start should be a Monday
      const startDate = new Date(review.periodStart + "T00:00:00Z");
      expect(startDate.getUTCDay()).toBe(1); // Monday
    });

    it("should save review without suggestions", async () => {
      const review = await reviews.save({
        type: "daily",
        summary: "No suggestions",
        patterns: [],
      });
      expect(review.suggestions).toBeNull();
    });
  });

  describe("getHistory", () => {
    it("should return history filtered by type", async () => {
      await reviews.save({ type: "daily", summary: "D1", patterns: [] });
      await reviews.save({ type: "daily", summary: "D2", patterns: [] });
      await reviews.save({ type: "weekly", summary: "W1", patterns: [] });

      const dailyHistory = await reviews.getHistory("daily");
      expect(dailyHistory.length).toBe(2);
      expect(dailyHistory.every((r) => r.type === "daily")).toBe(true);

      const weeklyHistory = await reviews.getHistory("weekly");
      expect(weeklyHistory.length).toBe(1);
    });

    it("should respect limit parameter", async () => {
      for (let i = 0; i < 5; i++) {
        await reviews.save({ type: "daily", summary: `Day ${i}`, patterns: [] });
      }
      const limited = await reviews.getHistory("daily", 3);
      expect(limited.length).toBe(3);
    });
  });

  describe("getDailySummary", () => {
    it("should return zero counts when no tasks or articles exist", async () => {
      const summary = await reviews.getDailySummary("2026-05-30");
      expect(summary.tasksCompleted).toBe(0);
      expect(summary.tasksTotal).toBe(0);
      expect(summary.completionRate).toBe(0);
      expect(summary.articlesRead).toBe(0);
      expect(summary.highlights).toEqual([]);
    });

    it("should calculate completion rate for tasks due on the target date", async () => {
      const today = new Date().toISOString().split("T")[0];
      // Insert tasks directly into the test DB
      testDb.insert(schema.tasks).values({
        id: "t1",
        userId: "local-user",
        title: "Done task",
        status: "done",
        dueDate: today,
        createdAt: today + "T10:00:00Z",
        updatedAt: today + "T10:00:00Z",
      }).run();
      testDb.insert(schema.tasks).values({
        id: "t2",
        userId: "local-user",
        title: "Pending task",
        status: "pending",
        dueDate: today,
        createdAt: today + "T10:00:00Z",
        updatedAt: today + "T10:00:00Z",
      }).run();
      testDb.insert(schema.tasks).values({
        id: "t3",
        userId: "local-user",
        title: "Deleted task",
        status: "deleted",
        dueDate: today,
        createdAt: today + "T10:00:00Z",
        updatedAt: today + "T10:00:00Z",
      }).run();

      const summary = await reviews.getDailySummary(today);
      expect(summary.tasksTotal).toBe(2); // excludes deleted
      expect(summary.tasksCompleted).toBe(1);
      expect(summary.completionRate).toBe(50);
      expect(summary.highlights).toEqual(["✅ Done task"]);
    });

    it("should count articles finished on the target date", async () => {
      const today = new Date().toISOString().split("T")[0];
      testDb.insert(schema.articles).values({
        id: "a1",
        userId: "local-user",
        title: "Read article",
        status: "finished",
        finishedAt: today + "T15:00:00Z",
      }).run();
      testDb.insert(schema.articles).values({
        id: "a2",
        userId: "local-user",
        title: "Unfinished article",
        status: "reading",
      }).run();

      const summary = await reviews.getDailySummary(today);
      expect(summary.articlesRead).toBe(1);
    });

    it("should use today's date when no date is provided", async () => {
      const summary = await reviews.getDailySummary();
      // Should not throw and should return valid structure
      expect(summary).toBeDefined();
      expect(typeof summary.tasksCompleted).toBe("number");
    });
  });

  describe("getWeeklyStats", () => {
    it("should return weekly stats with daily breakdown", async () => {
      // Use a known Monday as week start
      const weekStart = "2026-05-25"; // Monday
      const summary = await reviews.getWeeklyStats(weekStart);
      expect(summary.dailyBreakdown).toHaveLength(7);
      expect(summary.dailyBreakdown[0]!.date).toBe("2026-05-25");
      expect(summary.dailyBreakdown[6]!.date).toBe("2026-05-31");
    });

    it("should calculate completion rate for the week", async () => {
      const weekStart = "2026-05-25";
      testDb.insert(schema.tasks).values({
        id: "wt1",
        userId: "local-user",
        title: "Week done",
        status: "done",
        dueDate: "2026-05-26",
        createdAt: "2026-05-26T10:00:00Z",
        updatedAt: "2026-05-26T10:00:00Z",
      }).run();
      testDb.insert(schema.tasks).values({
        id: "wt2",
        userId: "local-user",
        title: "Week pending",
        status: "pending",
        dueDate: "2026-05-27",
        createdAt: "2026-05-27T10:00:00Z",
        updatedAt: "2026-05-27T10:00:00Z",
      }).run();

      const stats = await reviews.getWeeklyStats(weekStart);
      expect(stats.tasksTotal).toBe(2);
      expect(stats.tasksCompleted).toBe(1);
      expect(stats.completionRate).toBe(50);
    });

    it("should calculate top tags from tasks", async () => {
      const weekStart = "2026-05-25";
      testDb.insert(schema.tasks).values({
        id: "tag1",
        userId: "local-user",
        title: "Tagged 1",
        status: "done",
        dueDate: "2026-05-26",
        tags: '["work","urgent"]',
        createdAt: "2026-05-26T10:00:00Z",
        updatedAt: "2026-05-26T10:00:00Z",
      }).run();
      testDb.insert(schema.tasks).values({
        id: "tag2",
        userId: "local-user",
        title: "Tagged 2",
        status: "pending",
        dueDate: "2026-05-27",
        tags: '["work","planning"]',
        createdAt: "2026-05-27T10:00:00Z",
        updatedAt: "2026-05-27T10:00:00Z",
      }).run();

      const stats = await reviews.getWeeklyStats(weekStart);
      expect(stats.topTags.length).toBeGreaterThan(0);
      expect(stats.topTags[0]!.tag).toBe("work");
      expect(stats.topTags[0]!.count).toBe(2);
    });

    it("should count articles finished in the week", async () => {
      const weekStart = "2026-05-25";
      testDb.insert(schema.articles).values({
        id: "wa1",
        userId: "local-user",
        title: "Finished article",
        status: "finished",
        finishedAt: "2026-05-26T15:00:00Z",
      }).run();

      const stats = await reviews.getWeeklyStats(weekStart);
      expect(stats.articlesFinished).toBe(1);
    });
  });
});
