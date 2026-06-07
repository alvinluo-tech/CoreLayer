import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../schema.js";
import { createSqliteAgentRunRepo } from "./agent-run-repo.js";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      user_message_id TEXT,
      assistant_message_id TEXT,
      status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'succeeded', 'failed', 'cancelled', 'waiting_for_approval')),
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
  `);
  return drizzle(sqlite, { schema });
}

type TestDb = ReturnType<typeof createTestDb>;

describe("AgentRun Repository", () => {
  let db: TestDb;
  let agentRuns: ReturnType<typeof createSqliteAgentRunRepo>;

  beforeEach(() => {
    db = createTestDb();
    agentRuns = createSqliteAgentRunRepo(db);
  });

  describe("create", () => {
    it("should create an agent run with all fields", async () => {
      const run = await agentRuns.create({
        conversationId: "conv-1",
        userMessageId: "msg-1",
        assistantMessageId: "msg-2",
        selectedModel: "mimo-v2.5-pro",
        routeReason: "complex task",
      });
      expect(run.id).toBeDefined();
      expect(run.conversationId).toBe("conv-1");
      expect(run.userMessageId).toBe("msg-1");
      expect(run.assistantMessageId).toBe("msg-2");
      expect(run.selectedModel).toBe("mimo-v2.5-pro");
      expect(run.routeReason).toBe("complex task");
      expect(run.status).toBe("running");
      expect(run.startedAt).toBeDefined();
    });

    it("should create an agent run with minimal fields (defaults)", async () => {
      const run = await agentRuns.create({});
      expect(run.id).toBeDefined();
      expect(run.conversationId).toBeNull();
      expect(run.userMessageId).toBeNull();
      expect(run.assistantMessageId).toBeNull();
      expect(run.selectedModel).toBeNull();
      expect(run.routeReason).toBeNull();
      expect(run.status).toBe("running");
      expect(run.completedAt).toBeNull();
      expect(run.durationMs).toBeNull();
      expect(run.error).toBeNull();
    });
  });

  describe("getById", () => {
    it("should return an existing agent run", async () => {
      const created = await agentRuns.create({ conversationId: "conv-1" });
      const found = await agentRuns.getById(created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.conversationId).toBe("conv-1");
    });

    it("should return null for non-existent id", async () => {
      const found = await agentRuns.getById("non-existent-id");
      expect(found).toBeNull();
    });
  });

  describe("getByConversation", () => {
    it("should return all runs for a conversation", async () => {
      await agentRuns.create({ conversationId: "conv-1" });
      await agentRuns.create({ conversationId: "conv-1" });
      await agentRuns.create({ conversationId: "conv-2" });

      const runs = await agentRuns.getByConversation("conv-1");
      expect(runs.length).toBe(2);
      expect(runs.every((r) => r.conversationId === "conv-1")).toBe(true);
    });

    it("should return empty array for conversation with no runs", async () => {
      const runs = await agentRuns.getByConversation("no-runs");
      expect(runs).toEqual([]);
    });
  });

  describe("getRecent", () => {
    it("should return recent runs with default limit of 50", async () => {
      for (let i = 0; i < 5; i++) {
        await agentRuns.create({ conversationId: `conv-${i}` });
      }
      const recent = await agentRuns.getRecent();
      expect(recent.length).toBe(5);
    });

    it("should respect custom limit", async () => {
      for (let i = 0; i < 10; i++) {
        await agentRuns.create({ conversationId: `conv-${i}` });
      }
      const recent = await agentRuns.getRecent(3);
      expect(recent.length).toBe(3);
    });

    it("should return results in descending order by startedAt", async () => {
      const run1 = await agentRuns.create({ conversationId: "conv-1" });
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));
      const run2 = await agentRuns.create({ conversationId: "conv-2" });

      const recent = await agentRuns.getRecent();
      expect(recent[0]!.id).toBe(run2.id);
      expect(recent[1]!.id).toBe(run1.id);
    });
  });

  describe("updateStatus", () => {
    it("should update status to succeeded with completedAt and durationMs", async () => {
      const run = await agentRuns.create({});
      await agentRuns.updateStatus(run.id, "succeeded");

      const updated = await agentRuns.getById(run.id);
      expect(updated!.status).toBe("succeeded");
      expect(updated!.completedAt).toBeDefined();
      expect(updated!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should update status to failed with error message", async () => {
      const run = await agentRuns.create({});
      await agentRuns.updateStatus(run.id, "failed", "Something went wrong");

      const updated = await agentRuns.getById(run.id);
      expect(updated!.status).toBe("failed");
      expect(updated!.error).toBe("Something went wrong");
      expect(updated!.completedAt).toBeDefined();
    });

    it("should update status to cancelled without error", async () => {
      const run = await agentRuns.create({});
      await agentRuns.updateStatus(run.id, "cancelled");

      const updated = await agentRuns.getById(run.id);
      expect(updated!.status).toBe("cancelled");
      expect(updated!.error).toBeNull();
    });
  });
});
