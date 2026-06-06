import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";

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
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      tool_calls TEXT,
      tool_call_id TEXT,
      parent_message_id TEXT,
      token_count INTEGER,
      compressed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
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
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      scope_type TEXT NOT NULL DEFAULT 'user',
      scope_id TEXT,
      type TEXT NOT NULL,
      tier TEXT NOT NULL DEFAULT 'context',
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      source TEXT,
      confidence REAL,
      uses INTEGER DEFAULT 0,
      last_injected_at TEXT,
      source_run_id TEXT,
      source_message_id TEXT,
      last_verified_at TEXT,
      expires_at TEXT,
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
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cron_expr TEXT NOT NULL,
      prompt TEXT,
      skill_name TEXT,
      input TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run TEXT,
      next_run TEXT,
      last_result TEXT,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
  `);
  return drizzle(sqlite, { schema });
}

const testDb = createTestDb();
vi.mock("../db/client.js", () => ({ db: testDb, schema }));

const { createSqliteConversationRepo } = await import("../db/sqlite/conversation-repo.js");
const { createSqliteAgentRunRepo } = await import("../db/sqlite/agent-run-repo.js");
const { createSqliteMemoryRepo } = await import("../db/sqlite/memory-repo.js");
const { createSqliteTaskRepo } = await import("../db/sqlite/task-repo.js");
const { createSqliteArticleRepo } = await import("../db/sqlite/article-repo.js");
const { createSqliteScheduledTaskRepo } = await import("../db/sqlite/scheduled-task-repo.js");
const { createSqliteWorkspaceRepo } = await import("../db/sqlite/workspace-repo.js");
const { createSqliteProjectRepo } = await import("../db/sqlite/project-repo.js");
const { createSqliteAgentProfileRepo } = await import("../db/sqlite/agent-profile-repo.js");

vi.mock("../db/factory.js", () => ({
  getRepositories: () => ({
    conversations: createSqliteConversationRepo(),
    agentRuns: createSqliteAgentRunRepo(),
    memories: createSqliteMemoryRepo(),
    tasks: createSqliteTaskRepo(),
    articles: createSqliteArticleRepo(),
    scheduledTasks: createSqliteScheduledTaskRepo(),
    workspaces: createSqliteWorkspaceRepo(),
    projects: createSqliteProjectRepo(),
    agentProfiles: createSqliteAgentProfileRepo(),
  }),
}));

// Mock conversation handler to avoid LLM calls
vi.mock("../orchestrator/conversation.js", () => ({
  handleMessageInConversation: vi.fn().mockResolvedValue({
    userMessage: {
      id: "user-msg-1",
      conversationId: "conv-1",
      role: "user",
      content: "test input",
      toolCalls: null,
      toolCallId: null,
      parentMessageId: null,
      tokenCount: null,
      compressed: false,
      createdAt: new Date().toISOString(),
    },
    assistantMessage: {
      id: "asst-msg-1",
      conversationId: "conv-1",
      role: "assistant",
      content: "test response",
      toolCalls: null,
      toolCallId: null,
      parentMessageId: null,
      tokenCount: null,
      compressed: false,
      createdAt: new Date().toISOString(),
    },
    conversation: {
      id: "conv-1",
      userId: "default",
      workspaceId: null,
      projectId: null,
      title: "Test",
      modelUsed: "mimo-v2.5-pro",
      messageCount: 2,
      promptTokens: 0,
      completionTokens: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  }),
}));

const { runTurn } = await import("./run-executor.js");

describe("runTurn", () => {
  beforeEach(() => {
    testDb.delete(schema.agentRuns).run();
    testDb.delete(schema.tasks).run();
    testDb.delete(schema.messages).run();
    testDb.delete(schema.conversations).run();
  });

  it("should return result with text and conversationId", async () => {
    const result = await runTurn({
      workspaceId: "ws-1",
      agentId: "default",
      mode: "chat",
      input: "hello",
    });

    expect(result.text).toBe("test response");
    expect(result.conversationId).toBeDefined();
    expect(result.runId).toBeDefined();
  });

  it("should emit events via callback", async () => {
    const events: any[] = [];
    await runTurn(
      {
        workspaceId: "ws-1",
        agentId: "default",
        mode: "chat",
        input: "hello",
      },
      { onEvent: (e) => events.push(e) },
    );

    expect(events.some((e) => e.type === "run_started")).toBe(true);
    expect(events.some((e) => e.type === "run_completed")).toBe(true);
  });

  it("should create AgentRun record in database", async () => {
    const result = await runTurn({
      workspaceId: "ws-1",
      agentId: "agent-1",
      mode: "tick",
      input: "check status",
    });

    const { agentRuns } = await import("../db/factory.js").then((m) => m.getRepositories());
    const run = await agentRuns.getById(result.runId);
    expect(run).not.toBeNull();
    expect(run!.mode).toBe("tick");
    expect(run!.agentId).toBe("agent-1");
    expect(run!.workspaceId).toBe("ws-1");
    expect(run!.status).toBe("succeeded");
  });

  it("should create conversation when none provided", async () => {
    const result = await runTurn({
      workspaceId: "ws-1",
      agentId: "default",
      mode: "chat",
      input: "new conversation",
    });

    expect(result.conversationId).toBeDefined();
    const { conversations } = await import("../db/factory.js").then((m) => m.getRepositories());
    const conv = await conversations.getById(result.conversationId);
    expect(conv).not.toBeNull();
  });

  it("should handle errors and mark run as failed", async () => {
    const { handleMessageInConversation } = await import("../orchestrator/conversation.js");
    vi.mocked(handleMessageInConversation).mockRejectedValueOnce(new Error("LLM unavailable"));

    await expect(
      runTurn({
        workspaceId: "ws-1",
        agentId: "default",
        mode: "chat",
        input: "test error",
      }),
    ).rejects.toThrow("LLM unavailable");

    const { agentRuns } = await import("../db/factory.js").then((m) => m.getRepositories());
    const runs = await agentRuns.getRecent(1);
    expect(runs[0].status).toBe("failed");
    expect(runs[0].error).toContain("LLM unavailable");
  });

  it("should not auto-complete task runs by default", async () => {
    const { tasks } = await import("../db/factory.js").then((m) => m.getRepositories());
    const task = await tasks.create({ title: "Review required" });

    await runTurn({
      workspaceId: "ws-1",
      agentId: "default",
      mode: "chat",
      input: "work on task",
      taskId: task.id,
    });

    const updated = await tasks.getById(task.id);
    expect(updated?.status).toBe("running");
    expect(updated?.runHistory).toHaveLength(1);
    expect((updated?.runHistory[0] as { status?: string }).status).toBe("succeeded");
  });

  it("should use existing conversation when conversationId provided", async () => {
    const { conversations } = await import("../db/factory.js").then((m) => m.getRepositories());
    const conv = await conversations.create("Existing Chat");

    const result = await runTurn({
      workspaceId: "ws-1",
      agentId: "default",
      mode: "chat",
      input: "continue",
      conversationId: conv.id,
    });

    expect(result.conversationId).toBe(conv.id);
  });
});
