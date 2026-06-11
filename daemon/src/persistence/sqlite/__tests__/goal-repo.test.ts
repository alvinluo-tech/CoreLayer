import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../schema.js";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed', 'abandoned')),
      progress TEXT,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
  `);
  return drizzle(sqlite, { schema });
}

const testDb = createTestDb();

vi.mock("../../client.js", () => ({ db: testDb, schema }));

const { createSqliteGoalRepo } = await import("../goal-repo.js");

const goalRepo = createSqliteGoalRepo(testDb as any);

describe("GoalRepository", () => {
  beforeEach(() => {
    testDb.delete(schema.goals).run();
  });

  it("creates a goal and returns it", async () => {
    const goal = await goalRepo.create({ description: "Learn Rust" });
    expect(goal.id).toBeDefined();
    expect(goal.description).toBe("Learn Rust");
    expect(goal.status).toBe("active");
    expect(goal.progress).toBeNull();
  });

  it("creates a goal with custom status", async () => {
    const goal = await goalRepo.create({ description: "Paused goal", status: "paused" });
    expect(goal.status).toBe("paused");
  });

  it("creates a goal with progress", async () => {
    const goal = await goalRepo.create({ description: "With progress", progress: { pct: 50 } });
    expect(goal.progress).toEqual({ pct: 50 });
  });

  it("gets a goal by id", async () => {
    const created = await goalRepo.create({ description: "Find me" });
    const found = await goalRepo.getById(created.id);
    expect(found).not.toBeNull();
    expect(found!.description).toBe("Find me");
  });

  it("returns null for nonexistent id", async () => {
    const found = await goalRepo.getById("nonexistent");
    expect(found).toBeNull();
  });

  it("lists all goals", async () => {
    await goalRepo.create({ description: "Goal 1" });
    await goalRepo.create({ description: "Goal 2" });
    const goals = await goalRepo.list();
    expect(goals).toHaveLength(2);
  });

  it("gets active goals only", async () => {
    await goalRepo.create({ description: "Active 1" });
    await goalRepo.create({ description: "Active 2" });
    await goalRepo.create({ description: "Paused", status: "paused" });
    await goalRepo.create({ description: "Done", status: "completed" });

    const active = await goalRepo.getActive();
    expect(active).toHaveLength(2);
    expect(active.every((g) => g.status === "active")).toBe(true);
  });

  it("updates a goal", async () => {
    const created = await goalRepo.create({ description: "Original" });
    const updated = await goalRepo.update(created.id, { description: "Updated", status: "completed" });
    expect(updated.description).toBe("Updated");
    expect(updated.status).toBe("completed");
  });

  it("updates progress", async () => {
    const created = await goalRepo.create({ description: "Track progress" });
    const updated = await goalRepo.update(created.id, { progress: { pct: 75 } });
    expect(updated.progress).toEqual({ pct: 75 });
  });

  it("throws on update of nonexistent goal", async () => {
    await expect(goalRepo.update("nonexistent", { description: "x" })).rejects.toThrow("Goal not found");
  });

  it("deletes a goal", async () => {
    const created = await goalRepo.create({ description: "Delete me" });
    const deleted = await goalRepo.delete(created.id);
    expect(deleted).toBe(true);
    const found = await goalRepo.getById(created.id);
    expect(found).toBeNull();
  });

  it("returns false when deleting nonexistent goal", async () => {
    const deleted = await goalRepo.delete("nonexistent");
    expect(deleted).toBe(false);
  });
});
