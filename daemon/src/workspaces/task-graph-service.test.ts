import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../persistence/schema.js";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Default Workspace',
      description TEXT,
      owner_id TEXT NOT NULL,
      goal TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      active_project_id TEXT,
      completed_at TEXT,
      settings TEXT,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      spec TEXT,
      tech_stack TEXT,
      root_path TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      settings TEXT,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );

    CREATE TABLE IF NOT EXISTS agent_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      model_policy TEXT NOT NULL DEFAULT '{}',
      skills TEXT NOT NULL DEFAULT '[]',
      tools TEXT NOT NULL DEFAULT '[]',
      knowledge_scopes TEXT NOT NULL DEFAULT '[]',
      permissions TEXT NOT NULL DEFAULT '[]',
      memory_scopes TEXT NOT NULL DEFAULT '[]',
      is_default INTEGER NOT NULL DEFAULT 0,
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
  `);
  return drizzle(sqlite, { schema });
}

const testDb = createTestDb();

vi.mock("../persistence/client.js", () => ({ db: testDb, schema }));
vi.mock("../persistence/factory.js", () => ({
  getRepositories: () => ({
    tasks: createSqliteTaskRepo(),
  }),
}));

const mockEmitWorkspaceEvent = vi.fn();
vi.mock("../services/workspace-event-emitter.js", () => ({
  emitWorkspaceEvent: (...args: unknown[]) => mockEmitWorkspaceEvent(...args),
}));

const { createSqliteTaskRepo } = await import("../persistence/sqlite/task-repo.js");
const { TaskGraph } = await import("./task-graph-service.js");

describe("TaskGraph", () => {
  let graph: InstanceType<typeof TaskGraph>;
  let tasks: ReturnType<typeof createSqliteTaskRepo>;

  beforeEach(async () => {
    testDb.delete(schema.tasks).run();
    testDb.delete(schema.projects).run();
    testDb.delete(schema.workspaces).run();
    tasks = createSqliteTaskRepo();
    graph = new TaskGraph();
  });

  describe("canExecute", () => {
    it("should return true for a task with no dependencies", async () => {
      const task = await tasks.create({ title: "No deps" });
      const result = await graph.canExecute(task.id);
      expect(result).toBe(true);
    });

    it("should return true when all dependencies are completed", async () => {
      const dep1 = await tasks.create({ title: "Dep 1" });
      const dep2 = await tasks.create({ title: "Dep 2" });
      await tasks.update(dep1.id, { status: "completed" });
      await tasks.update(dep2.id, { status: "done" });

      const task = await tasks.create({
        title: "Main task",
        dependencies: [dep1.id, dep2.id],
      });

      const result = await graph.canExecute(task.id);
      expect(result).toBe(true);
    });

    it("should return false when some dependencies are incomplete", async () => {
      const dep1 = await tasks.create({ title: "Dep 1" });
      const dep2 = await tasks.create({ title: "Dep 2" });
      await tasks.update(dep1.id, { status: "completed" });
      // dep2 is still pending

      const task = await tasks.create({
        title: "Main task",
        dependencies: [dep1.id, dep2.id],
      });

      const result = await graph.canExecute(task.id);
      expect(result).toBe(false);
    });

    it("should return false for non-existent task", async () => {
      const result = await graph.canExecute("non-existent");
      expect(result).toBe(false);
    });

    it("should return false when dependency is deleted", async () => {
      const dep = await tasks.create({ title: "Dep" });
      await tasks.delete(dep.id);

      const task = await tasks.create({
        title: "Main task",
        dependencies: [dep.id],
      });

      const result = await graph.canExecute(task.id);
      expect(result).toBe(false);
    });
  });

  describe("getExecutableTasks", () => {
    it("should return tasks with no incomplete dependencies", async () => {
      // Create workspace and project for isolation
      const wsId = "test-ws";
      const projId = "test-proj";
      testDb.insert(schema.workspaces).values({ id: wsId, name: "Test", ownerId: "user" }).run();
      testDb.insert(schema.projects).values({ id: projId, workspaceId: wsId, name: "Test" }).run();

      const dep = await tasks.create({ title: "Dep", priority: 1 });
      // Set dep as completed and in the project
      testDb.update(schema.tasks).set({ projectId: projId }).where(eq(schema.tasks.id, dep.id)).run();
      await tasks.update(dep.id, { status: "completed" });

      const ready = await tasks.create({
        title: "Ready task",
        dependencies: [dep.id],
        priority: 2,
      });
      // Set ready as queued and in the project
      testDb.update(schema.tasks).set({ projectId: projId }).where(eq(schema.tasks.id, ready.id)).run();
      await tasks.update(ready.id, { status: "queued" });

      const blocked = await tasks.create({
        title: "Blocked task",
        dependencies: ["non-existent"],
        priority: 3,
      });
      // Set blocked as blocked and in the project
      testDb.update(schema.tasks).set({ projectId: projId }).where(eq(schema.tasks.id, blocked.id)).run();
      await tasks.update(blocked.id, { status: "blocked" });

      const executable = await graph.getExecutableTasks(projId);
      expect(executable.find((t: { id: string }) => t.id === ready.id)).toBeDefined();
      expect(executable.find((t: { id: string }) => t.id === blocked.id)).toBeUndefined();
    });
  });

  describe("completeTask", () => {
    it("should mark task as completed", async () => {
      const task = await tasks.create({ title: "To complete" });
      await graph.completeTask(task.id);

      const updated = await tasks.getById(task.id);
      expect(updated?.status).toBe("completed");
    });

    it("should unblock dependent tasks", async () => {
      // Create workspace and project for isolation
      const wsId = "test-ws";
      const projId = "test-proj";
      testDb.insert(schema.workspaces).values({ id: wsId, name: "Test", ownerId: "user" }).run();
      testDb.insert(schema.projects).values({ id: projId, workspaceId: wsId, name: "Test" }).run();

      const dep = await tasks.create({ title: "Dep" });
      // Update dep to be in the project
      testDb.update(schema.tasks).set({ projectId: projId }).where(eq(schema.tasks.id, dep.id)).run();

      const main = await tasks.create({
        title: "Main",
        dependencies: [dep.id],
      });
      // Update main to be in the project and blocked
      testDb.update(schema.tasks).set({ projectId: projId }).where(eq(schema.tasks.id, main.id)).run();
      await tasks.update(main.id, { status: "blocked", blockedBy: [dep.id] });

      // Complete the dependency
      await graph.completeTask(dep.id);

      // Main should now be queued (unblocked)
      const updated = await tasks.getById(main.id);
      expect(updated?.status).toBe("queued");
      expect(updated?.blockedBy).toEqual([]);
    });

    it("should unblock dependents even when dependency is already completed", async () => {
      const wsId = "test-ws";
      const projId = "test-proj";
      testDb.insert(schema.workspaces).values({ id: wsId, name: "Test", ownerId: "user" }).run();
      testDb.insert(schema.projects).values({ id: projId, workspaceId: wsId, name: "Test" }).run();

      const dep = await tasks.create({ title: "Dep" });
      testDb.update(schema.tasks).set({ projectId: projId }).where(eq(schema.tasks.id, dep.id)).run();
      await tasks.update(dep.id, { status: "completed" });

      const main = await tasks.create({
        title: "Main",
        dependencies: [dep.id],
      });
      testDb.update(schema.tasks).set({ projectId: projId }).where(eq(schema.tasks.id, main.id)).run();
      await tasks.update(main.id, { status: "blocked", blockedBy: [dep.id] });

      await graph.completeTask(dep.id);

      const updated = await tasks.getById(main.id);
      expect(updated?.status).toBe("queued");
      expect(updated?.blockedBy).toEqual([]);
    });

    it("should queue pending dependents when dependencies become complete", async () => {
      const wsId = "test-ws";
      const projId = "test-proj";
      testDb.insert(schema.workspaces).values({ id: wsId, name: "Test", ownerId: "user" }).run();
      testDb.insert(schema.projects).values({ id: projId, workspaceId: wsId, name: "Test" }).run();

      const dep = await tasks.create({ title: "Dep" });
      testDb.update(schema.tasks).set({ projectId: projId }).where(eq(schema.tasks.id, dep.id)).run();

      const main = await tasks.create({
        title: "Main",
        dependencies: [dep.id],
      });
      testDb.update(schema.tasks).set({ projectId: projId }).where(eq(schema.tasks.id, main.id)).run();

      await graph.completeTask(dep.id);

      const updated = await tasks.getById(main.id);
      expect(updated?.status).toBe("queued");
      expect(updated?.blockedBy).toEqual([]);
    });

    it("should throw for non-existent task", async () => {
      await expect(graph.completeTask("non-existent")).rejects.toThrow(
        "not found",
      );
    });

    it("should not re-complete an already completed task", async () => {
      const task = await tasks.create({ title: "Already done" });
      await tasks.update(task.id, { status: "completed" });

      // Should not throw
      await graph.completeTask(task.id);

      const updated = await tasks.getById(task.id);
      expect(updated?.status).toBe("completed");
    });

    it("should emit task.completed event when completing a task", async () => {
      mockEmitWorkspaceEvent.mockClear();
      const task = await tasks.create({ title: "Complete me" });
      await graph.completeTask(task.id);

      expect(mockEmitWorkspaceEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "workspace.task.completed",
          taskId: task.id,
        }),
      );
    });

    it("should emit task.unblocked event for dependent tasks", async () => {
      const wsId = "test-ws";
      const projId = "test-proj";
      testDb.insert(schema.workspaces).values({ id: wsId, name: "Test", ownerId: "user" }).run();
      testDb.insert(schema.projects).values({ id: projId, workspaceId: wsId, name: "Test" }).run();

      mockEmitWorkspaceEvent.mockClear();

      const dep = await tasks.create({ title: "Dep" });
      testDb.update(schema.tasks).set({ projectId: projId, workspaceId: wsId }).where(eq(schema.tasks.id, dep.id)).run();

      const main = await tasks.create({ title: "Main", dependencies: [dep.id] });
      testDb.update(schema.tasks).set({ projectId: projId, workspaceId: wsId }).where(eq(schema.tasks.id, main.id)).run();
      await tasks.update(main.id, { status: "blocked", blockedBy: [dep.id] });

      await graph.completeTask(dep.id);

      const unblockedEvent = mockEmitWorkspaceEvent.mock.calls.find(
        (call: any[]) => call[0].type === "workspace.task.unblocked",
      );
      expect(unblockedEvent).toBeDefined();
      expect(unblockedEvent![0].taskId).toBe(main.id);
      expect(unblockedEvent![0].payload.unblockedBy).toBe(dep.id);
    });
  });

  describe("detectCycles", () => {
    it("should return empty array when no cycles exist", async () => {
      const wsId = "test-ws";
      const projId = "test-proj";
      testDb.insert(schema.workspaces).values({ id: wsId, name: "Test", ownerId: "user" }).run();
      testDb.insert(schema.projects).values({ id: projId, workspaceId: wsId, name: "Test" }).run();

      const t1 = await tasks.create({ title: "T1" });
      const t2 = await tasks.create({ title: "T2" });
      await tasks.update(t1.id, { dependencies: [] });
      await tasks.update(t2.id, { dependencies: [t1.id] });

      const cycles = await graph.detectCycles(projId);
      expect(cycles).toEqual([]);
    });

    it("should detect a simple cycle", async () => {
      const wsId = "test-ws";
      const projId = "test-proj";
      testDb.insert(schema.workspaces).values({ id: wsId, name: "Test", ownerId: "user" }).run();
      testDb.insert(schema.projects).values({ id: projId, workspaceId: wsId, name: "Test" }).run();

      const t1 = await tasks.create({ title: "T1" });
      const t2 = await tasks.create({ title: "T2" });
      // Both tasks in the project
      testDb.update(schema.tasks).set({ projectId: projId }).where(eq(schema.tasks.id, t1.id)).run();
      testDb.update(schema.tasks).set({ projectId: projId }).where(eq(schema.tasks.id, t2.id)).run();
      // t1 depends on t2, t2 depends on t1
      await tasks.update(t1.id, { dependencies: [t2.id] });
      await tasks.update(t2.id, { dependencies: [t1.id] });

      const cycles = await graph.detectCycles(projId);
      expect(cycles.length).toBeGreaterThan(0);
    });
  });

  describe("setDependencies", () => {
    it("should set dependencies for a task", async () => {
      const dep = await tasks.create({ title: "Dep" });
      const task = await tasks.create({ title: "Main" });

      await graph.setDependencies(task.id, [dep.id]);

      const updated = await tasks.getById(task.id);
      expect(updated?.dependencies).toEqual([dep.id]);
    });

    it("should throw for self-dependency", async () => {
      const task = await tasks.create({ title: "Self dep" });

      await expect(graph.setDependencies(task.id, [task.id])).rejects.toThrow(
        "cannot depend on itself",
      );
    });

    it("should block task when dependencies are incomplete", async () => {
      const dep = await tasks.create({ title: "Dep" });
      const task = await tasks.create({ title: "Main" });

      await graph.setDependencies(task.id, [dep.id]);

      const updated = await tasks.getById(task.id);
      expect(updated?.status).toBe("blocked");
    });

    it("should not block task when all dependencies are complete", async () => {
      const dep = await tasks.create({ title: "Dep" });
      await tasks.update(dep.id, { status: "completed" });
      const task = await tasks.create({ title: "Main" });

      await graph.setDependencies(task.id, [dep.id]);

      const updated = await tasks.getById(task.id);
      // Should not be blocked since dep is complete
      expect(updated?.status).not.toBe("blocked");
    });

    it("should only update blockedBy on the blocked task", async () => {
      const dep = await tasks.create({ title: "Dep" });
      const task = await tasks.create({ title: "Main" });

      await graph.setDependencies(task.id, [dep.id]);

      const taskUpdated = await tasks.getById(task.id);
      const depUpdated = await tasks.getById(dep.id);
      expect(taskUpdated?.blockedBy).toEqual([dep.id]);
      expect(depUpdated?.blockedBy).toEqual([]);
    });

    it("should reject cycles and restore previous dependencies", async () => {
      const wsId = "test-ws";
      const projId = "test-proj";
      testDb.insert(schema.workspaces).values({ id: wsId, name: "Test", ownerId: "user" }).run();
      testDb.insert(schema.projects).values({ id: projId, workspaceId: wsId, name: "Test" }).run();

      const t1 = await tasks.create({ title: "T1" });
      const t2 = await tasks.create({ title: "T2" });
      testDb.update(schema.tasks).set({ projectId: projId }).where(eq(schema.tasks.id, t1.id)).run();
      testDb.update(schema.tasks).set({ projectId: projId }).where(eq(schema.tasks.id, t2.id)).run();

      await graph.setDependencies(t2.id, [t1.id]);
      await expect(graph.setDependencies(t1.id, [t2.id])).rejects.toThrow("cycle");

      const restored = await tasks.getById(t1.id);
      expect(restored?.dependencies).toEqual([]);
    });

    it("should unblock task when dependencies are removed", async () => {
      const dep = await tasks.create({ title: "Dep" });
      const task = await tasks.create({ title: "Main" });

      await graph.setDependencies(task.id, [dep.id]);
      // Task should be blocked
      let updated = await tasks.getById(task.id);
      expect(updated?.status).toBe("blocked");

      // Remove dependencies
      await graph.setDependencies(task.id, []);
      updated = await tasks.getById(task.id);
      expect(updated?.status).toBe("queued");
      expect(updated?.blockedBy).toEqual([]);
    });

    it("should emit task.blocked event when setting incomplete dependencies", async () => {
      mockEmitWorkspaceEvent.mockClear();
      const dep = await tasks.create({ title: "Dep" });
      const task = await tasks.create({ title: "Main" });

      await graph.setDependencies(task.id, [dep.id]);

      expect(mockEmitWorkspaceEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "workspace.task.blocked",
          taskId: task.id,
        }),
      );
    });
  });
});
