import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../../../../../persistence/schema.js";

function createTestDb() {
  const sqlite = new Database(":memory:");

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
  `);

  return drizzle(sqlite, { schema });
}

describe("Todo Connector", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("should create a task", () => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.insert(schema.tasks)
      .values({
        id,
        userId: "test-user",
        title: "Test task",
        priority: 1,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get();
    expect(task).toBeDefined();
    expect(task?.title).toBe("Test task");
    expect(task?.priority).toBe(1);
  });

  it("should query tasks by status", () => {
    const now = new Date().toISOString();

    db.insert(schema.tasks)
      .values([
        { id: "1", userId: "u1", title: "Task 1", status: "pending", createdAt: now, updatedAt: now },
        { id: "2", userId: "u1", title: "Task 2", status: "done", createdAt: now, updatedAt: now },
        { id: "3", userId: "u1", title: "Task 3", status: "pending", createdAt: now, updatedAt: now },
      ])
      .run();

    const allTasks = db.select().from(schema.tasks).all();
    expect(allTasks.length).toBe(3);

    const pendingTasks = allTasks.filter((t) => t.status === "pending");
    expect(pendingTasks.length).toBe(2);
  });

  it("should update task status", () => {
    const now = new Date().toISOString();
    const id = "1";

    db.insert(schema.tasks)
      .values({ id, userId: "u1", title: "Task 1", status: "pending", createdAt: now, updatedAt: now })
      .run();

    db.update(schema.tasks)
      .set({ status: "done", completedAt: now, updatedAt: now })
      .where(eq(schema.tasks.id, id))
      .run();

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get();
    expect(task?.status).toBe("done");
    expect(task?.completedAt).toBe(now);
  });

  it("should soft delete task", () => {
    const now = new Date().toISOString();
    const id = "1";

    db.insert(schema.tasks)
      .values({ id, userId: "u1", title: "Task 1", status: "pending", createdAt: now, updatedAt: now })
      .run();

    db.update(schema.tasks)
      .set({ status: "deleted", updatedAt: now })
      .where(eq(schema.tasks.id, id))
      .run();

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get();
    expect(task?.status).toBe("deleted");
  });
});
