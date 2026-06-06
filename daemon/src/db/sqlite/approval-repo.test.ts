import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../schema.js";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL DEFAULT 'default',
      settings TEXT,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
    CREATE TABLE IF NOT EXISTS agent_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      capabilities TEXT,
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      workspace_id TEXT,
      project_id TEXT,
      title TEXT NOT NULL DEFAULT 'New Chat',
      model_used TEXT NOT NULL DEFAULT 'mimo-v2.5-pro',
      message_count INTEGER NOT NULL DEFAULT 0,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      user_message_id TEXT,
      assistant_message_id TEXT,
      status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'succeeded', 'failed', 'cancelled')),
      selected_model TEXT,
      route_reason TEXT,
      tool_call_count INTEGER DEFAULT 0,
      workspace_id TEXT,
      project_id TEXT,
      task_id TEXT,
      agent_id TEXT,
      mode TEXT,
      selected_tools TEXT,
      memory_reads TEXT,
      memory_writes TEXT,
      tool_calls TEXT,
      artifacts TEXT,
      approvals TEXT,
      started_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      completed_at TEXT,
      duration_ms INTEGER,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS approval_requests (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES agent_runs(id),
      tool_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      args TEXT NOT NULL,
      risk TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'denied', 'expired')),
      project_scope INTEGER NOT NULL DEFAULT 0,
      decided_at INTEGER,
      created_at INTEGER NOT NULL,
      mode TEXT DEFAULT 'chat',
      source TEXT,
      preview TEXT,
      tool_call_id TEXT,
      expires_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS permission_memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT REFERENCES projects(id),
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
vi.mock("../client.js", () => ({ db: testDb, schema }));

const { createSqliteApprovalRepo } = await import("./approval-repo.js");
const { createSqliteAgentRunRepo } = await import("./agent-run-repo.js");

describe("ApprovalRequest Repository", () => {
  let approvalRepo: ReturnType<typeof createSqliteApprovalRepo>;
  let agentRunRepo: ReturnType<typeof createSqliteAgentRunRepo>;
  let testRunId: string;

  beforeEach(async () => {
    testDb.delete(schema.approvalRequests).run();
    testDb.delete(schema.agentRuns).run();
    approvalRepo = createSqliteApprovalRepo();
    agentRunRepo = createSqliteAgentRunRepo();
    // Create a test agent run to reference
    const run = await agentRunRepo.create({
      conversationId: "conv-test",
      workspaceId: "ws-1",
      agentId: "agent-1",
      mode: "chat",
    });
    testRunId = run.id;
  });

  describe("create", () => {
    it("should create a pending approval request", async () => {
      const request = await approvalRepo.create({
        runId: testRunId,
        toolId: "shell:exec",
        toolName: "Execute Shell Command",
        args: { command: "rm -rf /tmp/test" },
        risk: "high",
      });

      expect(request.id).toBeDefined();
      expect(request.status).toBe("pending");
      expect(request.toolId).toBe("shell:exec");
      expect(request.risk).toBe("high");
      expect(request.args).toEqual({ command: "rm -rf /tmp/test" });
      expect(request.projectScope).toBe(false);
      expect(request.decidedAt).toBeNull();
    });

    it("should create with project scope", async () => {
      const request = await approvalRepo.create({
        runId: testRunId,
        toolId: "db:write",
        toolName: "Write to Database",
        args: { query: "DELETE FROM users" },
        risk: "high",
        projectScope: true,
      });

      expect(request.projectScope).toBe(true);
    });
  });

  describe("getById", () => {
    it("should return null for non-existent id", async () => {
      const result = await approvalRepo.getById("non-existent");
      expect(result).toBeNull();
    });

    it("should return the request by id", async () => {
      const created = await approvalRepo.create({
        runId: testRunId,
        toolId: "test:tool",
        toolName: "Test Tool",
        args: {},
        risk: "low",
      });
      const fetched = await approvalRepo.getById(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
    });
  });

  describe("getPending", () => {
    it("should return only pending requests", async () => {
      await approvalRepo.create({
        runId: testRunId,
        toolId: "a",
        toolName: "A",
        args: {},
        risk: "low",
      });
      const b = await approvalRepo.create({
        runId: testRunId,
        toolId: "b",
        toolName: "B",
        args: {},
        risk: "high",
      });
      await approvalRepo.approve(b.id);

      const pending = await approvalRepo.getPending();
      expect(pending).toHaveLength(1);
      expect(pending[0].toolId).toBe("a");
    });

    it("should return empty when no pending", async () => {
      const pending = await approvalRepo.getPending();
      expect(pending).toHaveLength(0);
    });
  });

  describe("approve", () => {
    it("should set status to approved with decidedAt", async () => {
      const created = await approvalRepo.create({
        runId: testRunId,
        toolId: "test:tool",
        toolName: "Test Tool",
        args: {},
        risk: "medium",
      });

      const approved = await approvalRepo.approve(created.id);
      expect(approved.status).toBe("approved");
      expect(approved.decidedAt).toBeTypeOf("number");
    });
  });

  describe("deny", () => {
    it("should set status to denied with decidedAt", async () => {
      const created = await approvalRepo.create({
        runId: testRunId,
        toolId: "test:tool",
        toolName: "Test Tool",
        args: {},
        risk: "high",
      });

      const denied = await approvalRepo.deny(created.id);
      expect(denied.status).toBe("denied");
      expect(denied.decidedAt).toBeTypeOf("number");
    });
  });

  describe("getByRunId", () => {
    it("should return all requests for a run", async () => {
      await approvalRepo.create({
        runId: testRunId,
        toolId: "a",
        toolName: "A",
        args: {},
        risk: "low",
      });
      await approvalRepo.create({
        runId: testRunId,
        toolId: "b",
        toolName: "B",
        args: {},
        risk: "high",
      });

      const requests = await approvalRepo.getByRunId(testRunId);
      expect(requests).toHaveLength(2);
    });
  });
});
