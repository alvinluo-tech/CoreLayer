import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { createSqliteToolCallLogRepo } from "./sqlite/tool-call-log-repo.js";
import { createSqliteAppConnectionRepo } from "./sqlite/app-connection-repo.js";
import { createSqliteModelProfileRepo } from "./sqlite/model-profile-repo.js";
import { createSqliteMemoryRepo } from "./sqlite/memory-repo.js";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tool_call_logs (
      id TEXT PRIMARY KEY,
      tool_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      app_id TEXT,
      source TEXT NOT NULL CHECK(source IN ('mcp', 'native', 'skill', 'rest')),
      args TEXT,
      result_success INTEGER,
      result_data TEXT,
      result_error TEXT,
      risk TEXT,
      confirmed_by_user INTEGER,
      duration_ms INTEGER,
      conversation_id TEXT,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
    CREATE TABLE IF NOT EXISTS app_connections (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL UNIQUE,
      app_name TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('mcp', 'native', 'skill', 'rest')),
      config TEXT,
      status TEXT NOT NULL DEFAULT 'disconnected',
      last_connected TEXT,
      last_error TEXT,
      tool_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
    CREATE TABLE IF NOT EXISTS model_profiles (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      model_name TEXT NOT NULL,
      display_name TEXT,
      capabilities TEXT,
      limits TEXT,
      cost TEXT,
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      type TEXT NOT NULL CHECK(type IN ('fact', 'preference', 'context', 'summary')),
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      source TEXT,
      confidence REAL,
      uses INTEGER DEFAULT 0,
      expires_at TEXT,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );
  `);
  return drizzle(sqlite, { schema });
}

type TestDb = ReturnType<typeof createTestDb>;

describe("ToolCallLog Repository", () => {
  let db: TestDb;
  let toolCallLogs: ReturnType<typeof createSqliteToolCallLogRepo>;

  beforeEach(() => {
    db = createTestDb();
    toolCallLogs = createSqliteToolCallLogRepo(db);
  });

  it("should create a tool call log", async () => {
    const log = await toolCallLogs.create({
      toolId: "tool-1",
      toolName: "getTodayTasks",
      source: "native",
      resultSuccess: true,
      durationMs: 42,
    });
    expect(log.id).toBeDefined();
    expect(log.toolId).toBe("tool-1");
    expect(log.toolName).toBe("getTodayTasks");
    expect(log.source).toBe("native");
    expect(log.resultSuccess).toBe(true);
    expect(log.durationMs).toBe(42);
  });

  it("should create a tool call log with args and result data", async () => {
    const log = await toolCallLogs.create({
      toolId: "tool-2",
      toolName: "searchArticles",
      source: "mcp",
      args: { query: "rust async" },
      resultData: { results: [{ title: "Async in Rust" }] },
    });
    expect(log.args).toEqual({ query: "rust async" });
    expect(log.resultData).toEqual({ results: [{ title: "Async in Rust" }] });
  });

  it("should get recent logs limited by count", async () => {
    await toolCallLogs.create({ toolId: "t1", toolName: "a", source: "native" });
    await toolCallLogs.create({ toolId: "t2", toolName: "b", source: "native" });
    const recent = await toolCallLogs.getRecent(1);
    expect(recent.length).toBe(1);
  });

  it("should get logs by tool id", async () => {
    await toolCallLogs.create({ toolId: "tool-a", toolName: "x", source: "native" });
    await toolCallLogs.create({ toolId: "tool-a", toolName: "y", source: "native" });
    await toolCallLogs.create({ toolId: "tool-b", toolName: "z", source: "native" });
    const logs = await toolCallLogs.getByTool("tool-a");
    expect(logs.length).toBe(2);
  });
});

describe("AppConnection Repository", () => {
  let db: TestDb;
  let appConnections: ReturnType<typeof createSqliteAppConnectionRepo>;

  beforeEach(() => {
    db = createTestDb();
    appConnections = createSqliteAppConnectionRepo(db);
  });

  it("should upsert a new connection", async () => {
    const conn = await appConnections.upsert({
      appId: "mcp-github",
      appName: "GitHub MCP",
      source: "mcp",
      status: "connected",
      toolCount: 5,
    });
    expect(conn.appId).toBe("mcp-github");
    expect(conn.appName).toBe("GitHub MCP");
    expect(conn.status).toBe("connected");
    expect(conn.toolCount).toBe(5);
    expect(conn.lastConnected).toBeDefined();
  });

  it("should upsert an existing connection", async () => {
    await appConnections.upsert({
      appId: "mcp-github",
      appName: "GitHub MCP",
      source: "mcp",
    });
    const updated = await appConnections.upsert({
      appId: "mcp-github",
      appName: "GitHub MCP Updated",
      source: "mcp",
      status: "error",
      lastError: "Connection refused",
    });
    expect(updated.appName).toBe("GitHub MCP Updated");
    expect(updated.status).toBe("error");
    expect(updated.lastError).toBe("Connection refused");
  });

  it("should get all connections", async () => {
    await appConnections.upsert({ appId: "a", appName: "A", source: "mcp" });
    await appConnections.upsert({ appId: "b", appName: "B", source: "native" });
    const all = await appConnections.getAll();
    expect(all.length).toBe(2);
  });

  it("should delete a connection", async () => {
    await appConnections.upsert({ appId: "to-delete", appName: "Del", source: "mcp" });
    const deleted = await appConnections.delete("to-delete");
    expect(deleted).toBe(true);
    const conn = await appConnections.getByAppId("to-delete");
    expect(conn).toBeNull();
  });
});

describe("ModelProfile Repository", () => {
  let db: TestDb;
  let modelProfiles: ReturnType<typeof createSqliteModelProfileRepo>;

  beforeEach(() => {
    db = createTestDb();
    modelProfiles = createSqliteModelProfileRepo(db);
  });

  it("should upsert a new model profile", async () => {
    const profile = await modelProfiles.upsert({
      provider: "xiaomi",
      modelName: "mimo-2.5-pro",
      displayName: "MiMo 2.5 Pro",
      capabilities: { toolUse: true, streaming: true },
      isDefault: true,
    });
    expect(profile.provider).toBe("xiaomi");
    expect(profile.modelName).toBe("mimo-2.5-pro");
    expect(profile.capabilities).toEqual({ toolUse: true, streaming: true });
    expect(profile.isDefault).toBe(true);
  });

  it("should get the default profile", async () => {
    await modelProfiles.upsert({ provider: "a", modelName: "model-a", isDefault: false });
    await modelProfiles.upsert({ provider: "b", modelName: "model-b", isDefault: true });
    const def = await modelProfiles.getDefault();
    expect(def?.modelName).toBe("model-b");
  });

  it("should set default and clear previous default", async () => {
    const p1 = await modelProfiles.upsert({ provider: "a", modelName: "model-a", isDefault: true });
    await modelProfiles.upsert({ provider: "b", modelName: "model-b" });
    await modelProfiles.setDefault(p1.id);
    // model-b should now be default, model-a should not
    const def = await modelProfiles.getDefault();
    // Wait — setDefault sets the given id as default. p1 is model-a.
    expect(def?.modelName).toBe("model-a");
  });

  it("should delete a profile", async () => {
    await modelProfiles.upsert({ provider: "a", modelName: "to-delete" });
    const all = await modelProfiles.getAll();
    expect(all.length).toBe(1);
    const deleted = await modelProfiles.delete(all[0]!.id);
    expect(deleted).toBe(true);
    const after = await modelProfiles.getAll();
    expect(after.length).toBe(0);
  });
});

describe("Memory Repository", () => {
  let db: TestDb;
  let memories: ReturnType<typeof createSqliteMemoryRepo>;

  beforeEach(() => {
    db = createTestDb();
    memories = createSqliteMemoryRepo(db);
  });

  it("should upsert a new memory", async () => {
    const mem = await memories.upsert({
      type: "fact",
      key: "user_name",
      value: "Alvin",
      confidence: 0.95,
    });
    expect(mem.key).toBe("user_name");
    expect(mem.value).toBe("Alvin");
    expect(mem.type).toBe("fact");
    expect(mem.confidence).toBe(0.95);
  });

  it("should upsert an existing memory (update)", async () => {
    await memories.upsert({ type: "fact", key: "user_lang", value: "en" });
    const updated = await memories.upsert({ type: "fact", key: "user_lang", value: "zh-CN" });
    expect(updated.value).toBe("zh-CN");
    const all = await memories.getAll();
    expect(all.length).toBe(1);
  });

  it("should get memories by type", async () => {
    await memories.upsert({ type: "fact", key: "a", value: "1" });
    await memories.upsert({ type: "preference", key: "b", value: "2" });
    await memories.upsert({ type: "fact", key: "c", value: "3" });
    const facts = await memories.getByType("fact");
    expect(facts.length).toBe(2);
    const prefs = await memories.getByType("preference");
    expect(prefs.length).toBe(1);
  });

  it("should search memories by key and value", async () => {
    await memories.upsert({ type: "fact", key: "favorite_color", value: "blue" });
    await memories.upsert({ type: "fact", key: "language", value: "zh-CN" });
    const results = await memories.search("color");
    expect(results.length).toBe(1);
    expect(results[0]!.key).toBe("favorite_color");
  });

  it("should delete a memory", async () => {
    await memories.upsert({ type: "fact", key: "to-delete", value: "gone" });
    const mem = await memories.getByKey("to-delete");
    expect(mem).toBeDefined();
    const deleted = await memories.delete(mem!.id);
    expect(deleted).toBe(true);
    const after = await memories.getByKey("to-delete");
    expect(after).toBeNull();
  });

  it("should clean expired memories", async () => {
    const pastDate = "2020-01-01T00:00:00Z";
    const futureDate = "2099-01-01T00:00:00Z";
    await memories.upsert({ type: "context", key: "expired", value: "old", expiresAt: pastDate });
    await memories.upsert({ type: "context", key: "valid", value: "new", expiresAt: futureDate });
    await memories.upsert({ type: "fact", key: "permanent", value: "forever" });
    const cleaned = await memories.cleanExpired();
    expect(cleaned).toBe(1);
    const remaining = await memories.getAll();
    expect(remaining.length).toBe(2);
    expect(remaining.map((m) => m.key)).toContain("valid");
    expect(remaining.map((m) => m.key)).toContain("permanent");
  });
});
