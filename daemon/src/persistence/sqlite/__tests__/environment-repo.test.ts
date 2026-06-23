import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../schema.js";
import { createSqliteEnvironmentSessionRepo, createSqliteEnvironmentEventRepo } from "../environment-repo.js";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

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

    CREATE TABLE IF NOT EXISTS agent_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      role TEXT NOT NULL DEFAULT 'general',
      capabilities TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      model_policy TEXT NOT NULL DEFAULT '{}',
      executor_policy TEXT,
      skills TEXT NOT NULL DEFAULT '[]',
      tools TEXT NOT NULL DEFAULT '[]',
      knowledge_scopes TEXT NOT NULL DEFAULT '[]',
      permissions TEXT NOT NULL DEFAULT '[]',
      memory_scopes TEXT NOT NULL DEFAULT '[]',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );

    CREATE TABLE IF NOT EXISTS environment_sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      project_id TEXT,
      run_id TEXT,
      agent_id TEXT REFERENCES agent_profiles(id),
      environment_kind TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'created' CHECK(state IN ('created', 'preparing', 'ready', 'active', 'paused', 'completed', 'failed', 'disposed')),
      working_directory TEXT,
      access_policy TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
    );

    CREATE TABLE IF NOT EXISTS environment_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES environment_sessions(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload TEXT,
      created_at TEXT NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
    );

    CREATE INDEX IF NOT EXISTS idx_env_sessions_workspace ON environment_sessions(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_env_sessions_run ON environment_sessions(run_id);
    CREATE INDEX IF NOT EXISTS idx_env_events_session ON environment_events(session_id, sequence);
  `);

  return drizzle(sqlite, { schema });
}

describe("EnvironmentSessionRepository", () => {
  let db: ReturnType<typeof createTestDb>;
  let repo: ReturnType<typeof createSqliteEnvironmentSessionRepo>;

  beforeEach(() => {
    db = createTestDb();
    repo = createSqliteEnvironmentSessionRepo(db);
    db.insert(schema.workspaces).values({ id: "ws-1", name: "Test", ownerId: "user-1" }).run();
    db.insert(schema.agentProfiles).values({ id: "agent-1", name: "Agent" }).run();
  });

  it("should create a coding environment session", async () => {
    const row = await repo.create({
      workspaceId: "ws-1",
      environmentKind: "git-worktree",
      workingDirectory: "/tmp/repo",
    });
    expect(row.id).toBeDefined();
    expect(row.environmentKind).toBe("git-worktree");
    expect(row.state).toBe("created");
    expect(row.workingDirectory).toBe("/tmp/repo");
  });

  it("should create a research environment session", async () => {
    const row = await repo.create({
      workspaceId: "ws-1",
      environmentKind: "browser-session",
      metadata: { startUrl: "https://arxiv.org" },
    });
    expect(row.environmentKind).toBe("browser-session");
    expect(row.metadata).toEqual({ startUrl: "https://arxiv.org" });
  });

  it("should get by id", async () => {
    const created = await repo.create({ workspaceId: "ws-1", environmentKind: "git-worktree" });
    const found = await repo.getById(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  it("should get by run", async () => {
    await repo.create({ workspaceId: "ws-1", runId: "run-1", environmentKind: "git-worktree" });
    await repo.create({ workspaceId: "ws-1", runId: "run-1", environmentKind: "git-worktree" });
    const rows = await repo.getByRun("run-1");
    expect(rows).toHaveLength(2);
  });

  it("should get by workspace", async () => {
    await repo.create({ workspaceId: "ws-1", environmentKind: "git-worktree" });
    const rows = await repo.getByWorkspace("ws-1");
    expect(rows).toHaveLength(1);
  });

  it("should get active sessions", async () => {
    const s1 = await repo.create({ workspaceId: "ws-1", environmentKind: "git-worktree" });
    const s2 = await repo.create({ workspaceId: "ws-1", environmentKind: "browser-session" });
    await repo.updateState(s2.id, "disposed");

    const active = await repo.getActive();
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(s1.id);
  });

  it("should update state", async () => {
    const created = await repo.create({ workspaceId: "ws-1", environmentKind: "git-worktree" });
    await repo.updateState(created.id, "ready");
    const updated = await repo.getById(created.id);
    expect(updated!.state).toBe("ready");
  });

  it("should dispose session", async () => {
    const created = await repo.create({ workspaceId: "ws-1", environmentKind: "git-worktree" });
    await repo.dispose(created.id);
    const updated = await repo.getById(created.id);
    expect(updated!.state).toBe("disposed");
  });

  it("should update fields", async () => {
    const created = await repo.create({ workspaceId: "ws-1", environmentKind: "git-worktree" });
    await repo.update(created.id, {
      workingDirectory: "/new/path",
      accessPolicy: { allowedPaths: ["src/**"] },
    });
    const updated = await repo.getById(created.id);
    expect(updated!.workingDirectory).toBe("/new/path");
    expect(updated!.accessPolicy).toEqual({ allowedPaths: ["src/**"] });
  });
});

describe("EnvironmentEventRepository", () => {
  let db: ReturnType<typeof createTestDb>;
  let sessionRepo: ReturnType<typeof createSqliteEnvironmentSessionRepo>;
  let eventRepo: ReturnType<typeof createSqliteEnvironmentEventRepo>;

  beforeEach(() => {
    db = createTestDb();
    sessionRepo = createSqliteEnvironmentSessionRepo(db);
    eventRepo = createSqliteEnvironmentEventRepo(db);
    db.insert(schema.workspaces).values({ id: "ws-1", name: "Test", ownerId: "user-1" }).run();
  });

  it("should create events with auto-incrementing sequence", async () => {
    const session = await sessionRepo.create({ workspaceId: "ws-1", environmentKind: "git-worktree" });

    const e1 = await eventRepo.create({ sessionId: session.id, type: "session.created" });
    const e2 = await eventRepo.create({ sessionId: session.id, type: "session.ready" });
    const e3 = await eventRepo.create({ sessionId: session.id, type: "action.executed", payload: { kind: "shell" } });

    expect(e1.sequence).toBe(1);
    expect(e2.sequence).toBe(2);
    expect(e3.sequence).toBe(3);
  });

  it("should get events by session ordered by sequence", async () => {
    const session = await sessionRepo.create({ workspaceId: "ws-1", environmentKind: "git-worktree" });

    await eventRepo.create({ sessionId: session.id, type: "session.created" });
    await eventRepo.create({ sessionId: session.id, type: "session.ready" });
    await eventRepo.create({ sessionId: session.id, type: "session.disposed" });

    const events = await eventRepo.getBySession(session.id);
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe("session.created");
    expect(events[1].type).toBe("session.ready");
    expect(events[2].type).toBe("session.disposed");
  });

  it("should get next sequence for empty session", async () => {
    const session = await sessionRepo.create({ workspaceId: "ws-1", environmentKind: "git-worktree" });
    const next = await eventRepo.getNextSequence(session.id);
    expect(next).toBe(1);
  });

  it("should handle non-coding events", async () => {
    const session = await sessionRepo.create({ workspaceId: "ws-1", environmentKind: "browser-session" });

    await eventRepo.create({ sessionId: session.id, type: "page.navigated", payload: { url: "https://example.com" } });
    await eventRepo.create({ sessionId: session.id, type: "element.clicked", payload: { selector: "#submit" } });

    const events = await eventRepo.getBySession(session.id);
    expect(events).toHaveLength(2);
    expect(events[0].payload).toEqual({ url: "https://example.com" });
    expect(events[1].payload).toEqual({ selector: "#submit" });
  });
});
