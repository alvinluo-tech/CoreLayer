import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
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
  `);
  return drizzle(sqlite, { schema });
}

const testDb = createTestDb();

vi.mock("../../client.js", () => ({ db: testDb, schema }));

// Dynamic import after mock so the repo picks up the mocked db
const { createSqliteTaskRepo } = await import("../task-repo.js");

describe("Task Repository", () => {
  let tasks: ReturnType<typeof createSqliteTaskRepo>;

  beforeEach(() => {
    // Clear all rows before each test for isolation
    testDb.delete(schema.tasks).run();
    tasks = createSqliteTaskRepo();
  });

  describe("create", () => {
    it("should create a task with all fields", async () => {
      const task = await tasks.create({
        title: "Write tests",
        description: "For all repos",
        priority: 1,
        dueDate: "2026-06-01",
        tags: ["testing", "vitest"],
      });
      expect(task.id).toBeDefined();
      expect(task.title).toBe("Write tests");
      expect(task.description).toBe("For all repos");
      expect(task.priority).toBe(1);
      expect(task.status).toBe("pending");
      expect(task.dueDate).toBe("2026-06-01");
      expect(task.tags).toEqual(["testing", "vitest"]);
      expect(task.userId).toBe("local-user");
    });

    it("should create a task with minimal fields (defaults)", async () => {
      const task = await tasks.create({ title: "Simple task" });
      expect(task.id).toBeDefined();
      expect(task.title).toBe("Simple task");
      expect(task.description).toBeNull();
      expect(task.priority).toBe(3);
      expect(task.status).toBe("pending");
      expect(task.dueDate).toBeNull();
      expect(task.tags).toBeNull();
    });

    it("should serialize tags as JSON", async () => {
      const task = await tasks.create({ title: "Tagged", tags: ["a", "b", "c"] });
      expect(task.tags).toEqual(["a", "b", "c"]);
      // Verify raw DB storage is JSON string
      const raw = testDb
        .select({ tags: schema.tasks.tags })
        .from(schema.tasks)
        .all();
      expect(raw[0]!.tags).toBe('["a","b","c"]');
    });
  });

  describe("query", () => {
    it("should return all non-deleted tasks when no filters", async () => {
      await tasks.create({ title: "Task 1" });
      await tasks.create({ title: "Task 2" });
      // Soft-delete one
      const t3 = await tasks.create({ title: "Task 3" });
      await tasks.delete(t3.id);

      const result = await tasks.query();
      expect(result.length).toBe(2);
      expect(result.every((t) => t.status !== "deleted")).toBe(true);
    });

    it("should filter by status", async () => {
      await tasks.create({ title: "Pending" });
      const t2 = await tasks.create({ title: "In progress" });
      await tasks.update(t2.id, { status: "in_progress" });

      const pending = await tasks.query({ status: "pending" });
      expect(pending.length).toBe(1);
      expect(pending[0]!.title).toBe("Pending");
    });

    it("should filter by priority", async () => {
      await tasks.create({ title: "High", priority: 1 });
      await tasks.create({ title: "Low", priority: 5 });

      const high = await tasks.query({ priority: 1 });
      expect(high.length).toBe(1);
      expect(high[0]!.title).toBe("High");
    });
  });

  describe("getById", () => {
    it("should return an existing task", async () => {
      const created = await tasks.create({ title: "Find me" });
      const found = await tasks.getById(created.id);
      expect(found).not.toBeNull();
      expect(found!.title).toBe("Find me");
    });

    it("should return null for non-existent id", async () => {
      const found = await tasks.getById("non-existent");
      expect(found).toBeNull();
    });
  });

  describe("update", () => {
    it("should update title", async () => {
      const task = await tasks.create({ title: "Old title" });
      const updated = await tasks.update(task.id, { title: "New title" });
      expect(updated.title).toBe("New title");
    });

    it("should set completedAt when status is done", async () => {
      const task = await tasks.create({ title: "Do this" });
      const updated = await tasks.update(task.id, { status: "done" });
      expect(updated.status).toBe("done");
      expect(updated.completedAt).toBeDefined();
    });

    it("should update tags with JSON serialization", async () => {
      const task = await tasks.create({ title: "Tagged" });
      const updated = await tasks.update(task.id, { tags: ["new-tag"] });
      expect(updated.tags).toEqual(["new-tag"]);
    });
  });

  describe("delete", () => {
    it("should soft delete (set status to deleted)", async () => {
      const task = await tasks.create({ title: "Delete me" });
      const result = await tasks.delete(task.id);
      expect(result).toBe(true);

      // Should not appear in query results
      const all = await tasks.query();
      expect(all.find((t) => t.id === task.id)).toBeUndefined();
    });

    it("should return false for non-existent id", async () => {
      const result = await tasks.delete("non-existent");
      expect(result).toBe(false);
    });
  });

  describe("getTodayTasks", () => {
    it("should return tasks due today", async () => {
      const today = new Date().toISOString().split("T")[0];
      await tasks.create({ title: "Today", dueDate: today! });
      await tasks.create({ title: "Tomorrow", dueDate: "2099-12-31" });

      const todayTasks = await tasks.getTodayTasks();
      expect(todayTasks.find((t) => t.title === "Today")).toBeDefined();
      expect(todayTasks.find((t) => t.title === "Tomorrow")).toBeUndefined();
    });

    it("should include high priority tasks (priority <= 2) regardless of due date", async () => {
      await tasks.create({ title: "Urgent", priority: 1 });

      const todayTasks = await tasks.getTodayTasks();
      expect(todayTasks.find((t) => t.title === "Urgent")).toBeDefined();
    });

    it("should exclude done and deleted tasks", async () => {
      const today = new Date().toISOString().split("T")[0];
      const t1 = await tasks.create({ title: "Done today", dueDate: today! });
      const t2 = await tasks.create({ title: "Deleted today", dueDate: today! });
      await tasks.update(t1.id, { status: "done" });
      await tasks.delete(t2.id);

      const todayTasks = await tasks.getTodayTasks();
      expect(todayTasks.find((t) => t.title === "Done today")).toBeUndefined();
      expect(todayTasks.find((t) => t.title === "Deleted today")).toBeUndefined();
    });
  });

  describe("create with task graph fields", () => {
    it("should create a task with dependencies", async () => {
      const task = await tasks.create({
        title: "With deps",
        dependencies: ["dep-1", "dep-2"],
      });
      expect(task.dependencies).toEqual(["dep-1", "dep-2"]);
    });

    it("should create a task with acceptance criteria", async () => {
      const task = await tasks.create({
        title: "With criteria",
        acceptanceCriteria: ["Passes tests", "Code reviewed"],
      });
      expect(task.acceptanceCriteria).toEqual(["Passes tests", "Code reviewed"]);
    });

    it("should default empty arrays for new fields", async () => {
      const task = await tasks.create({ title: "Defaults" });
      expect(task.dependencies).toEqual([]);
      expect(task.blockedBy).toEqual([]);
      expect(task.acceptanceCriteria).toEqual([]);
      expect(task.artifacts).toEqual([]);
      expect(task.runHistory).toEqual([]);
      expect(task.manualInterventionRequired).toBe(false);
    });
  });

  describe("update with task graph fields", () => {
    it("should update dependencies", async () => {
      const task = await tasks.create({ title: "Update deps" });
      const updated = await tasks.update(task.id, { dependencies: ["a", "b"] });
      expect(updated.dependencies).toEqual(["a", "b"]);
    });

    it("should update status to completed", async () => {
      const task = await tasks.create({ title: "Complete me" });
      const updated = await tasks.update(task.id, { status: "completed" });
      expect(updated.status).toBe("completed");
      expect(updated.completedAt).toBeDefined();
    });

    it("should update artifacts", async () => {
      const task = await tasks.create({ title: "Artifacts" });
      const updated = await tasks.update(task.id, {
        artifacts: [{ type: "file", path: "/tmp/test.txt" }],
      });
      expect(updated.artifacts).toEqual([{ type: "file", path: "/tmp/test.txt" }]);
    });
  });

  describe("getByProjectId", () => {
    it("should return tasks for a project", async () => {
      const t1 = await tasks.create({ title: "Task 1" });
      const t2 = await tasks.create({ title: "Task 2" });
      const t3 = await tasks.create({ title: "Task 3" });

      // Manually set project IDs
      testDb.update(schema.tasks)
        .set({ projectId: "proj-1" })
        .where(eq(schema.tasks.id, t1.id))
        .run();
      testDb.update(schema.tasks)
        .set({ projectId: "proj-1" })
        .where(eq(schema.tasks.id, t2.id))
        .run();
      testDb.update(schema.tasks)
        .set({ projectId: "proj-2" })
        .where(eq(schema.tasks.id, t3.id))
        .run();

      const result = await tasks.getByProjectId("proj-1");
      expect(result.length).toBe(2);
      expect(result.map((t) => t.id).sort()).toEqual([t1.id, t2.id].sort());
    });

    it("should exclude deleted tasks", async () => {
      const t1 = await tasks.create({ title: "Active" });
      testDb.update(schema.tasks)
        .set({ projectId: "proj-1" })
        .where(eq(schema.tasks.id, t1.id))
        .run();
      await tasks.delete(t1.id);

      const result = await tasks.getByProjectId("proj-1");
      expect(result.length).toBe(0);
    });
  });

  describe("getByParentId", () => {
    it("should return sub-tasks of a parent", async () => {
      const parent = await tasks.create({ title: "Parent" });
      const child1 = await tasks.create({
        title: "Child 1",
        parentTaskId: parent.id,
      });
      const child2 = await tasks.create({
        title: "Child 2",
        parentTaskId: parent.id,
      });

      const result = await tasks.getByParentId(parent.id);
      expect(result.length).toBe(2);
      expect(result.map((t) => t.id).sort()).toEqual(
        [child1.id, child2.id].sort(),
      );
    });

    it("should return empty array for task with no children", async () => {
      const task = await tasks.create({ title: "No children" });
      const result = await tasks.getByParentId(task.id);
      expect(result).toEqual([]);
    });
  });

  describe("query with projectId filter", () => {
    it("should filter by projectId", async () => {
      const t1 = await tasks.create({ title: "Task 1" });
      await tasks.create({ title: "Task 2" });
      testDb.update(schema.tasks)
        .set({ projectId: "proj-1" })
        .where(eq(schema.tasks.id, t1.id))
        .run();

      const result = await tasks.query({ projectId: "proj-1" });
      expect(result.length).toBe(1);
      expect(result[0]!.id).toBe(t1.id);
    });
  });
});
