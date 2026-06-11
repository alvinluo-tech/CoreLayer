import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../schema.js";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL DEFAULT 'default',
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
    CREATE TABLE IF NOT EXISTS permission_memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT,
      tool_id TEXT NOT NULL,
      risk TEXT NOT NULL,
      decision TEXT NOT NULL CHECK(decision IN ('auto', 'confirm', 'deny')),
      scope TEXT NOT NULL DEFAULT 'global' CHECK(scope IN ('global', 'project', 'session')),
      created_at INTEGER NOT NULL,
      expires_at INTEGER
    );
  `);
  return drizzle(sqlite, { schema });
}

const testDb = createTestDb();
vi.mock("../../client.js", () => ({ db: testDb, schema }));

const { createSqlitePermissionMemoryRepo } = await import("../permission-memory-repo.js");

describe("PermissionMemory Repository", () => {
  let repo: ReturnType<typeof createSqlitePermissionMemoryRepo>;

  beforeEach(() => {
    testDb.delete(schema.permissionMemories).run();
    repo = createSqlitePermissionMemoryRepo();
  });

  describe("create", () => {
    it("should create a permission memory with defaults", async () => {
      const mem = await repo.create({
        toolId: "shell:exec",
        risk: "high",
        decision: "auto",
      });

      expect(mem.id).toBeDefined();
      expect(mem.toolId).toBe("shell:exec");
      expect(mem.decision).toBe("auto");
      expect(mem.scope).toBe("global");
      expect(mem.userId).toBe("default");
      expect(mem.projectId).toBeNull();
      expect(mem.expiresAt).toBeNull();
    });

    it("should create with project scope", async () => {
      const mem = await repo.create({
        toolId: "db:write",
        risk: "high",
        decision: "deny",
        scope: "project",
        projectId: "proj-123",
      });

      expect(mem.scope).toBe("project");
      expect(mem.projectId).toBe("proj-123");
    });
  });

  describe("find", () => {
    it("should find global permission memory", async () => {
      await repo.create({
        toolId: "shell:exec",
        risk: "high",
        decision: "auto",
        scope: "global",
      });

      const found = await repo.find("shell:exec");
      expect(found).not.toBeNull();
      expect(found!.decision).toBe("auto");
    });

    it("should return null when no memory exists", async () => {
      const found = await repo.find("nonexistent:tool");
      expect(found).toBeNull();
    });

    it("should prefer project-specific over global", async () => {
      await repo.create({
        toolId: "shell:exec",
        risk: "high",
        decision: "auto",
        scope: "global",
      });
      await repo.create({
        toolId: "shell:exec",
        risk: "high",
        decision: "deny",
        scope: "project",
        projectId: "proj-123",
      });

      const found = await repo.find("shell:exec", "default", "proj-123");
      expect(found!.decision).toBe("deny");
    });

    it("should fall back to global when no project match", async () => {
      await repo.create({
        toolId: "shell:exec",
        risk: "high",
        decision: "confirm",
        scope: "global",
      });

      const found = await repo.find("shell:exec", "default", "proj-other");
      expect(found!.decision).toBe("confirm");
    });

    it("should return null for expired memory", async () => {
      const pastTime = Date.now() - 10000;
      await repo.create({
        toolId: "shell:exec",
        risk: "high",
        decision: "auto",
        scope: "global",
        expiresAt: pastTime,
      });

      const found = await repo.find("shell:exec");
      expect(found).toBeNull();
    });

    it("should return non-expired memory", async () => {
      const futureTime = Date.now() + 60_000;
      await repo.create({
        toolId: "shell:exec",
        risk: "high",
        decision: "auto",
        scope: "global",
        expiresAt: futureTime,
      });

      const found = await repo.find("shell:exec");
      expect(found).not.toBeNull();
    });
  });

  describe("getByUserId", () => {
    it("should return all memories for a user", async () => {
      await repo.create({
        toolId: "a",
        risk: "low",
        decision: "auto",
      });
      await repo.create({
        toolId: "b",
        risk: "high",
        decision: "deny",
      });

      const all = await repo.getByUserId("default");
      expect(all).toHaveLength(2);
    });
  });

  describe("getByProjectId", () => {
    it("should return only project-scoped memories", async () => {
      await repo.create({
        toolId: "a",
        risk: "low",
        decision: "auto",
        scope: "global",
      });
      await repo.create({
        toolId: "b",
        risk: "high",
        decision: "deny",
        scope: "project",
        projectId: "proj-123",
      });

      const projectMems = await repo.getByProjectId("proj-123");
      expect(projectMems).toHaveLength(1);
      expect(projectMems[0].toolId).toBe("b");
    });
  });

  describe("delete", () => {
    it("should delete a permission memory", async () => {
      const mem = await repo.create({
        toolId: "test:tool",
        risk: "medium",
        decision: "confirm",
      });

      const deleted = await repo.delete(mem.id);
      expect(deleted).toBe(true);

      const found = await repo.find("test:tool");
      expect(found).toBeNull();
    });

    it("should return false for non-existent id", async () => {
      const deleted = await repo.delete("nonexistent");
      expect(deleted).toBe(false);
    });
  });
});
