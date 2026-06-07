import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../../persistence/schema.js";

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
    CREATE TABLE IF NOT EXISTS agent_run_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload TEXT,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
  `);
  return drizzle(sqlite, { schema });
}

const testDb = createTestDb();
vi.mock("../../../persistence/client.js", () => ({ db: testDb, schema }));

const { createSqliteConversationRepo } = await import("../../../persistence/sqlite/conversation-repo.js");
const { createSqliteAgentRunRepo } = await import("../../../persistence/sqlite/agent-run-repo.js");
const { createSqliteMemoryRepo } = await import("../../../persistence/sqlite/memory-repo.js");
const { createSqliteTaskRepo } = await import("../../../persistence/sqlite/task-repo.js");
const { createSqliteArticleRepo } = await import("../../../persistence/sqlite/article-repo.js");
const { createSqliteScheduledTaskRepo } = await import("../../../persistence/sqlite/scheduled-task-repo.js");
const { createSqliteWorkspaceRepo } = await import("../../../persistence/sqlite/workspace-repo.js");
const { createSqliteProjectRepo } = await import("../../../persistence/sqlite/project-repo.js");
const { createSqliteAgentProfileRepo } = await import("../../../persistence/sqlite/agent-profile-repo.js");
const { createSqliteAgentRunEventRepo } = await import("../../../persistence/sqlite/agent-run-event-repo.js");

vi.mock("../../../persistence/factory.js", () => ({
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
    agentRunEvents: createSqliteAgentRunEventRepo(),
  }),
}));

// Mock streamChat to return a fake stream with delta events
vi.mock("../application/conversation.js", () => ({
  streamChat: vi.fn().mockImplementation(
    (
      _messages: unknown,
      _mode: unknown,
      _conversationId: unknown,
      _onToolEvent: unknown,
      abortController?: AbortController,
    ) =>
      Promise.resolve({
        stream: {
          fullStream: {
            [Symbol.asyncIterator]() {
              let i = 0;
              const chunks = [
                { type: "delta", text: "Hello " },
                { type: "delta", text: "world" },
              ];
              return {
                async next() {
                  if (abortController?.signal.aborted) {
                    throw new Error("The operation was aborted");
                  }
                  if (i < chunks.length) {
                    return { value: chunks[i++], done: false };
                  }
                  return { value: undefined, done: true };
                },
              };
            },
          },
        },
        abortController: abortController ?? new AbortController(),
      }),
  ),
}));

// Mock normalizeStream to pass through delta events
vi.mock("../../shared/stream/sse-normalizer.js", () => ({
  normalizeStream: vi.fn((stream: AsyncIterable<unknown>) => stream),
}));

vi.mock("../../shared/stream/stream-timeout.js", () => ({
  withStreamTimeout: vi.fn((stream: AsyncIterable<unknown>) => stream),
}));

vi.mock("../../config/config-manager.js", () => ({
  configManager: {
    getStreamTimeout: () => 120_000,
  },
}));

vi.mock("../../shared/errors.js", () => ({
  logError: vi.fn(),
}));

vi.mock("../run-context.js", () => ({
  resolveRunContext: vi.fn().mockResolvedValue({
    workspaceId: "ws-test",
    agentId: "agent-test",
  }),
  resolveConversationScope: vi.fn().mockResolvedValue({
    conversationId: undefined,
    workspaceId: "ws-test",
    projectId: undefined,
    taskId: undefined,
    agentId: "agent-test",
  }),
}));

const { runStreamTurn } = await import("../stream.js");
const { streamChat } = await import("../application/conversation.js");

describe("runStreamTurn", () => {
  beforeEach(() => {
    testDb.delete(schema.agentRuns).run();
    testDb.delete(schema.conversations).run();
    testDb.delete(schema.messages).run();
    testDb.delete(schema.agentRunEvents).run();
  });

  it("creates an AgentRun row before streaming", async () => {
    const result = await runStreamTurn({
      mode: "chat",
      input: "test input",
    });

    const runs = testDb.select().from(schema.agentRuns).all();
    expect(runs.length).toBe(1);
    expect(runs[0].status).toBe("running");
    expect(runs[0].mode).toBe("chat");

    // Consume the stream to trigger completion
    for await (const _event of result.stream) {
      // consume
    }
  });

  it("stream emits delta events", async () => {
    const result = await runStreamTurn({
      mode: "chat",
      input: "test input",
    });

    const events: unknown[] = [];
    for await (const event of result.stream) {
      events.push(event);
    }

    const deltaEvents = events.filter((e: unknown) => (e as { type: string }).type === "delta");
    expect(deltaEvents.length).toBeGreaterThan(0);
  });

  it("emits run_started and run_completed events", async () => {
    const result = await runStreamTurn({
      mode: "chat",
      input: "test input",
    });

    const events: unknown[] = [];
    for await (const event of result.stream) {
      events.push(event);
    }

    const types = events.map((e: unknown) => (e as { type: string }).type);
    expect(types).toContain("run_started");
    expect(types).toContain("run_completed");
  });

  it("persists events to agent_run_events table", async () => {
    const result = await runStreamTurn({
      mode: "chat",
      input: "test input",
    });

    for await (const _event of result.stream) {
      // consume
    }

    const dbEvents = testDb.select().from(schema.agentRunEvents).all();
    expect(dbEvents.length).toBeGreaterThan(0);

    const types = dbEvents.map((e) => e.type);
    expect(types).toContain("run_started");
    expect(types).toContain("run_completed");
  });

  it("events have sequential sequence numbers", async () => {
    const result = await runStreamTurn({
      mode: "chat",
      input: "test input",
    });

    for await (const _event of result.stream) {
      // consume
    }

    const dbEvents = testDb
      .select()
      .from(schema.agentRunEvents)
      .all()
      .sort((a, b) => a.sequence - b.sequence);

    for (let i = 0; i < dbEvents.length; i++) {
      expect(dbEvents[i].sequence).toBe(i);
    }
  });

  it("marks AgentRun as succeeded after stream completes", async () => {
    const result = await runStreamTurn({
      mode: "chat",
      input: "test input",
    });

    for await (const _event of result.stream) {
      // consume
    }

    const run = testDb.select().from(schema.agentRuns).get();
    expect(run?.status).toBe("succeeded");
  });

  it("saves user message to conversation", async () => {
    const result = await runStreamTurn({
      mode: "chat",
      input: "test input",
    });

    for await (const _event of result.stream) {
      // consume
    }

    const messages = testDb.select().from(schema.messages).all();
    const userMsgs = messages.filter((m) => m.role === "user");
    expect(userMsgs.length).toBe(1);
    expect(userMsgs[0].content).toBe("test input");
  });

  it("saves assistant message after stream completes", async () => {
    const result = await runStreamTurn({
      mode: "chat",
      input: "test input",
    });

    for await (const _event of result.stream) {
      // consume
    }

    const messages = testDb.select().from(schema.messages).all();
    const asstMsgs = messages.filter((m) => m.role === "assistant");
    expect(asstMsgs.length).toBe(1);
    expect(asstMsgs[0].content).toContain("Hello");
  });

  it("supports voice mode", async () => {
    const result = await runStreamTurn({
      mode: "voice",
      input: "voice input",
    });

    for await (const _event of result.stream) {
      // consume
    }

    const run = testDb.select().from(schema.agentRuns).get();
    expect(run?.mode).toBe("voice");
  });

  it("calls onEvent callback for each event", async () => {
    const onEvent = vi.fn();

    const result = await runStreamTurn(
      { mode: "chat", input: "test input" },
      { onEvent },
    );

    for await (const _event of result.stream) {
      // consume
    }

    expect(onEvent).toHaveBeenCalled();
    const eventTypes = onEvent.mock.calls.map((c: unknown[]) => (c[0] as { type: string }).type);
    expect(eventTypes).toContain("run_started");
    expect(eventTypes).toContain("run_completed");
  });

  it("returns runId and conversationId", async () => {
    const result = await runStreamTurn({
      mode: "chat",
      input: "test input",
    });

    expect(result.runId).toBeDefined();
    expect(result.conversationId).toBeDefined();
    expect(result.abortController).toBeDefined();
  });

  it("model error marks run as failed", async () => {
    vi.mocked(streamChat).mockRejectedValueOnce(new Error("LLM unavailable"));

    const result = await runStreamTurn({
      mode: "chat",
      input: "test input",
    });

    const events: unknown[] = [];
    for await (const event of result.stream) {
      events.push(event);
    }

    const run = testDb.select().from(schema.agentRuns).get();
    expect(run?.status).toBe("failed");
    expect(run?.error).toContain("LLM unavailable");

    const types = events.map((e: unknown) => (e as { type: string }).type);
    expect(types).toContain("run_failed");
  });

  it("client disconnect marks run as cancelled", async () => {
    const abortController = new AbortController();

    // Mock a stream that yields one delta then checks abort signal on next call
    let streamStep = 0;
    vi.mocked(streamChat).mockImplementationOnce(async () => ({
      stream: {
        fullStream: {
          [Symbol.asyncIterator]() {
            return {
              async next() {
                streamStep++;
                if (streamStep === 1) {
                  return { value: { type: "delta", text: "partial " }, done: false };
                }
                if (abortController.signal.aborted) {
                  throw new Error("The operation was aborted");
                }
                return { value: undefined, done: true };
              },
            };
          },
        },
      },
    }) as never);

    const result = await runStreamTurn(
      { mode: "chat", input: "test input" },
      { abortController },
    );

    // Consume events, abort after first delta
    const events: unknown[] = [];
    for await (const event of result.stream) {
      events.push(event);
      if (events.length === 2) {
        abortController.abort();
      }
    }

    const run = testDb.select().from(schema.agentRuns).get();
    expect(run?.status).toBe("cancelled");
  });

  it("watchdog abort marks run as failed (not cancelled)", async () => {
    // Simulate watchdog by aborting with the watchdog flag path.
    // In the real code, the watchdog sets abortedByWatchdog=true before abort().
    // We test the distinction: when streamChat itself throws (not from abort),
    // the run is marked "failed" regardless of abort signal state.
    vi.mocked(streamChat).mockRejectedValueOnce(new Error("watchdog: timeout exceeded"));

    const result = await runStreamTurn({
      mode: "chat",
      input: "test input",
    });

    const events: unknown[] = [];
    for await (const event of result.stream) {
      events.push(event);
    }

    const run = testDb.select().from(schema.agentRuns).get();
    expect(run?.status).toBe("failed");
    expect(run?.error).toContain("timeout");
  });

  it("saves partial assistant text on stream error", async () => {
    // Mock a stream that yields one delta then throws
    vi.mocked(streamChat).mockResolvedValueOnce({
      stream: {
        fullStream: {
          [Symbol.asyncIterator]() {
            let called = false;
            return {
              async next() {
                if (!called) {
                  called = true;
                  return { value: { type: "delta", text: "partial" }, done: false };
                }
                throw new Error("stream broke");
              },
            };
          },
        },
      },
    } as never);

    const result = await runStreamTurn({
      mode: "chat",
      input: "test input",
    });

    const events: unknown[] = [];
    for await (const event of result.stream) {
      events.push(event);
    }

    // Should have saved partial assistant message
    const messages = testDb.select().from(schema.messages).all();
    const asstMsgs = messages.filter((m) => m.role === "assistant");
    expect(asstMsgs.length).toBe(1);
    expect(asstMsgs[0].content).toContain("partial");

    const run = testDb.select().from(schema.agentRuns).get();
    expect(run?.status).toBe("failed");
  });
});
