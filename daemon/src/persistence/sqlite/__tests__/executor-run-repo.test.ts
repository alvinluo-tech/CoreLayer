import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../schema.js";
import { createSqliteExecutorRunRepo } from "../executor-run-repo.js";

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

    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      workspace_id TEXT,
      project_id TEXT,
      task_id TEXT,
      agent_id TEXT,
      user_message_id TEXT,
      assistant_message_id TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      mode TEXT NOT NULL DEFAULT 'chat',
      selected_model TEXT,
      route_reason TEXT,
      selected_tools TEXT DEFAULT '[]',
      memory_reads TEXT DEFAULT '[]',
      memory_writes TEXT DEFAULT '[]',
      tool_calls TEXT DEFAULT '[]',
      tool_call_count INTEGER DEFAULT 0,
      artifacts TEXT DEFAULT '[]',
      approvals TEXT DEFAULT '[]',
      agent_snapshot TEXT,
      started_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      completed_at TEXT,
      duration_ms INTEGER,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS executor_runs (
      id TEXT PRIMARY KEY,
      agent_run_id TEXT REFERENCES agent_runs(id),
      workspace_id TEXT REFERENCES workspaces(id),
      project_id TEXT,
      task_id TEXT,
      agent_id TEXT REFERENCES agent_profiles(id),
      adapter_id TEXT NOT NULL,
      attempt_number INTEGER NOT NULL DEFAULT 1,
      native_session_id TEXT,
      native_turn_id TEXT,
      event_cursor INTEGER NOT NULL DEFAULT 0,
      heartbeat_at TEXT,
      lease_owner TEXT,
      lease_expires_at TEXT,
      domain TEXT NOT NULL DEFAULT 'coding',
      status TEXT NOT NULL DEFAULT 'created' CHECK(status IN (
        'created', 'queued', 'preparing_environment', 'waiting_for_permission',
        'starting_executor', 'running', 'waiting_for_executor_input',
        'collecting_artifacts', 'verifying', 'needs_retry',
        'succeeded', 'failed', 'cancelled', 'timed_out', 'cleanup_failed'
      )),
      task_prompt TEXT NOT NULL,
      environment_kind TEXT NOT NULL DEFAULT 'local',
      environment_config TEXT DEFAULT '{}',
      working_directory TEXT,
      pid INTEGER,
      exit_code INTEGER,
      error TEXT,
      failure_category TEXT,
      timeout_ms INTEGER,
      artifacts TEXT DEFAULT '{}',
      started_at TEXT NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
      completed_at TEXT,
      duration_ms INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_executor_runs_agent_run ON executor_runs(agent_run_id);
    CREATE INDEX IF NOT EXISTS idx_executor_runs_workspace ON executor_runs(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_executor_runs_status ON executor_runs(status);
  `);

  return drizzle(sqlite, { schema });
}

describe("ExecutorRunRepository", () => {
  let db: ReturnType<typeof createTestDb>;
  let repo: ReturnType<typeof createSqliteExecutorRunRepo>;

  beforeEach(() => {
    db = createTestDb();
    repo = createSqliteExecutorRunRepo(db);

    // Seed prerequisite data
    db.insert(schema.workspaces)
      .values({ id: "ws-1", name: "Test Workspace", ownerId: "user-1" })
      .run();
    db.insert(schema.agentProfiles)
      .values({ id: "agent-1", name: "Test Agent" })
      .run();
    db.insert(schema.agentRuns)
      .values({ id: "run-1" })
      .run();
  });

  it("should create a coding executor run", async () => {
    const row = await repo.create({
      adapterId: "claude-code",
      domain: "coding",
      taskPrompt: "Fix the bug",
      environmentKind: "git-worktree",
      workingDirectory: "/tmp/test-repo",
      environmentConfig: { branch: "feat/fix", worktreePath: "/tmp/worktree" },
    });

    expect(row.id).toBeDefined();
    expect(row.adapterId).toBe("claude-code");
    expect(row.domain).toBe("coding");
    expect(row.status).toBe("created");
    expect(row.environmentKind).toBe("git-worktree");
    expect(row.workingDirectory).toBe("/tmp/test-repo");
    expect(row.environmentConfig).toEqual({ branch: "feat/fix", worktreePath: "/tmp/worktree" });
  });

  it("should create a research executor run (non-coding domain)", async () => {
    const row = await repo.create({
      adapterId: "browser-research",
      domain: "research",
      taskPrompt: "Summarize recent AI papers",
      environmentKind: "browser-session",
      workingDirectory: null as unknown as undefined,
      environmentConfig: { startUrl: "https://arxiv.org" },
    });

    expect(row.domain).toBe("research");
    expect(row.environmentKind).toBe("browser-session");
    expect(row.environmentConfig).toEqual({ startUrl: "https://arxiv.org" });
  });

  it("should create with all optional fields", async () => {
    const row = await repo.create({
      agentRunId: "run-1",
      workspaceId: "ws-1",
      agentId: "agent-1",
      adapterId: "codex",
      domain: "coding",
      taskPrompt: "Add tests",
      environmentKind: "git-worktree",
      workingDirectory: "/tmp/repo",
      environmentConfig: { branch: "feat/test" },
      timeoutMs: 60000,
      attemptNumber: 2,
      nativeSessionId: "session-1",
      nativeTurnId: "turn-1",
      eventCursor: 4,
      heartbeatAt: "2026-07-11T12:00:00.000Z",
      leaseOwner: "daemon:test",
      leaseExpiresAt: "2026-07-11T12:01:00.000Z",
    });

    expect(row.agentRunId).toBe("run-1");
    expect(row.workspaceId).toBe("ws-1");
    expect(row.agentId).toBe("agent-1");
    expect(row.timeoutMs).toBe(60000);
    expect(row.attemptNumber).toBe(2);
    expect(row.nativeSessionId).toBe("session-1");
    expect(row.nativeTurnId).toBe("turn-1");
    expect(row.eventCursor).toBe(4);
    expect(row.leaseOwner).toBe("daemon:test");
  });

  it("should get by id", async () => {
    const created = await repo.create({
      adapterId: "claude-code",
      taskPrompt: "Test",
    });

    const found = await repo.getById(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  it("should return null for non-existent id", async () => {
    const found = await repo.getById("non-existent");
    expect(found).toBeNull();
  });

  it("should get by agent run", async () => {
    await repo.create({ agentRunId: "run-1", adapterId: "claude-code", taskPrompt: "Task 1" });
    await repo.create({ agentRunId: "run-1", adapterId: "codex", taskPrompt: "Task 2" });

    const rows = await repo.getByAgentRun("run-1");
    expect(rows).toHaveLength(2);
  });

  it("should get by workspace", async () => {
    await repo.create({ workspaceId: "ws-1", adapterId: "claude-code", taskPrompt: "Task 1" });

    const rows = await repo.getByWorkspace("ws-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].workspaceId).toBe("ws-1");
  });

  it("should update status to terminal with duration", async () => {
    const created = await repo.create({ adapterId: "claude-code", taskPrompt: "Test" });

    await repo.updateStatus(created.id, "succeeded");

    const updated = await repo.getById(created.id);
    expect(updated!.status).toBe("succeeded");
    expect(updated!.completedAt).toBeDefined();
    expect(updated!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("should update status to failed with error", async () => {
    const created = await repo.create({ adapterId: "claude-code", taskPrompt: "Test" });

    await repo.updateStatus(created.id, "failed", "Process crashed");

    const updated = await repo.getById(created.id);
    expect(updated!.status).toBe("failed");
    expect(updated!.error).toBe("Process crashed");
  });

  it("should clear terminal fields when setting non-terminal status", async () => {
    const created = await repo.create({ adapterId: "claude-code", taskPrompt: "Test" });

    await repo.updateStatus(created.id, "succeeded");
    await repo.updateStatus(created.id, "running");

    const updated = await repo.getById(created.id);
    expect(updated!.status).toBe("running");
    expect(updated!.completedAt).toBeNull();
    expect(updated!.durationMs).toBeNull();
  });

  it("should update arbitrary fields", async () => {
    const created = await repo.create({ adapterId: "claude-code", taskPrompt: "Test" });

    await repo.update(created.id, {
      pid: 12345,
      environmentConfig: { branch: "main" },
      artifacts: { outputs: [{ type: "report", content: "done" }] },
    });

    const updated = await repo.getById(created.id);
    expect(updated!.pid).toBe(12345);
    expect(updated!.environmentConfig).toEqual({ branch: "main" });
    expect(updated!.artifacts).toEqual({ outputs: [{ type: "report", content: "done" }] });
  });

  it("should get active runs (non-terminal)", async () => {
    const r1 = await repo.create({ adapterId: "claude-code", taskPrompt: "Active" });
    const r2 = await repo.create({ adapterId: "codex", taskPrompt: "Completed" });

    await repo.updateStatus(r2.id, "succeeded");

    const active = await repo.getActive();
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(r1.id);
  });

  it("should default domain to coding", async () => {
    const row = await repo.create({ adapterId: "claude-code", taskPrompt: "Test" });
    expect(row.domain).toBe("coding");
    expect(row.environmentKind).toBe("local");
  });
});
