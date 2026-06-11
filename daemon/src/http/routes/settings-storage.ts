import { Hono } from "hono";
import fs from "fs";
import pg from "pg";
import { env } from "../../config/env.js";
import { resolveAppPaths } from "../../config/app-paths.js";
import {
  setStorageMode,
  isCloudConfigured,
  getDbConfig,
  setDbConfig,
} from "../../config/storage-config.js";
import { switchStorageMode, getCurrentMode, getRepositories } from "../../persistence/factory.js";
import { apiError } from "../../shared/errors.js";
import { maskApiKey, isMaskedKey } from "./settings-helpers.js";
import { withErrorHandling } from "../middleware/error-handler.js";

const app = new Hono();

// ---- SQL DDL ----

const POSTGRES_MIGRATION_DDL = `
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    workspace_id TEXT,
    project_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 3 NOT NULL,
    status TEXT DEFAULT 'pending' NOT NULL,
    due_date TEXT,
    tags TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    url TEXT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'unread' NOT NULL,
    rating INTEGER,
    notes TEXT,
    category TEXT,
    added_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    started_at TEXT,
    finished_at TEXT
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    task_completion_rate REAL,
    articles_read INTEGER,
    summary TEXT,
    patterns TEXT,
    suggestions TEXT,
    raw_data TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'default' NOT NULL,
    workspace_id TEXT,
    project_id TEXT,
    title TEXT DEFAULT 'New Chat' NOT NULL,
    model_used TEXT DEFAULT 'mimo-v2.5-pro' NOT NULL,
    message_count INTEGER DEFAULT 0 NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT DEFAULT '' NOT NULL,
    tool_calls TEXT,
    tool_call_id TEXT,
    token_count INTEGER,
    model_used TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tool_call_logs (
    id TEXT PRIMARY KEY,
    tool_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    app_id TEXT,
    source TEXT NOT NULL,
    args TEXT,
    result_success INTEGER,
    result_data TEXT,
    result_error TEXT,
    risk TEXT,
    confirmed_by_user INTEGER,
    duration_ms INTEGER,
    conversation_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_connections (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL UNIQUE,
    app_name TEXT NOT NULL,
    source TEXT NOT NULL,
    config TEXT,
    status TEXT DEFAULT 'disconnected' NOT NULL,
    last_connected TEXT,
    last_error TEXT,
    tool_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
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
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'default' NOT NULL,
    type TEXT NOT NULL,
    scope_type TEXT NOT NULL DEFAULT 'user' CHECK(scope_type IN ('user', 'workspace', 'project', 'agent', 'task', 'conversation')),
    scope_id TEXT,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    source TEXT,
    confidence REAL,
    expires_at TEXT,
    source_run_id TEXT,
    source_message_id TEXT,
    last_verified_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    user_message_id TEXT,
    assistant_message_id TEXT,
    status TEXT DEFAULT 'running' NOT NULL,
    selected_model TEXT,
    route_reason TEXT,
    tool_call_count INTEGER DEFAULT 0,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at TEXT,
    duration_ms INTEGER,
    error TEXT
  );
`;

// ---- Table Registry ----

interface TableEntry {
  label: string;
  description: string;
  list: () => Promise<unknown[]>;
  delete: (id: string) => Promise<boolean>;
  clear: () => Promise<number>;
}

function getTableRegistry(): Record<string, TableEntry> {
  const repos = getRepositories();
  return {
    conversations: {
      label: "会话历史 (Conversations)",
      description: "Jarvis 与您的所有对话交互记录",
      list: () => repos.conversations.list(),
      delete: (id) => repos.conversations.delete(id),
      clear: () => repos.conversations.clear(),
    },
    tasks: {
      label: "任务列表 (Tasks)",
      description: "日常待办事项及执行状态跟踪记录",
      list: () => repos.tasks.query(),
      delete: (id) => repos.tasks.delete(id),
      clear: () => repos.tasks.clear(),
    },
    articles: {
      label: "阅读文章 (Articles)",
      description: "收藏待阅的网页文章、剪贴板记录等",
      list: () => repos.articles.list(),
      delete: (id) => repos.articles.delete(id),
      clear: () => repos.articles.clear(),
    },
    memories: {
      label: "记忆胶囊 (Memories)",
      description: "提取的结构化长期记忆和个人偏好",
      list: () => repos.memories.getAll(),
      delete: (id) => repos.memories.delete(id),
      clear: () => repos.memories.clear(),
    },
  };
}

// ---- Storage Mode ----

app.get("/", withErrorHandling("settings/get", async (c) => {
  return c.json({
    storageMode: getCurrentMode(),
    availableModes: ["local", "cloud", "postgres"],
    cloudConfigured: isCloudConfigured(),
    postgresConfigured: !!env.DATABASE_URL,
  });
}));

app.put("/storage-mode", withErrorHandling("settings/storage-mode", async (c) => {
  const body = await c.req.json<{ mode: string }>();

  if (body.mode !== "local" && body.mode !== "cloud" && body.mode !== "postgres") {
    return apiError(c, "Invalid mode. Must be 'local', 'cloud' or 'postgres'.", 400);
  }

  if (body.mode === "cloud" && !isCloudConfigured()) {
    return apiError(c, "Cloud mode requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be configured.", 400);
  }

  const dbConfig = getDbConfig();
  if (body.mode === "postgres" && !env.DATABASE_URL && !dbConfig.postgresUrl) {
    return apiError(c, "PostgreSQL 模式需要配置 DATABASE_URL 环境变量或在外接数据库中配置连接串。", 400);
  }

  setStorageMode(body.mode as "local" | "cloud" | "postgres");
  await switchStorageMode(body.mode as "local" | "cloud" | "postgres");

  return c.json({
    storageMode: body.mode,
    message: `Storage mode switched to ${body.mode}.`,
  });
}));

// ---- Dynamic Database Configuration Endpoints ----

app.get("/db-config", (c) => {
  const config = getDbConfig();
  return c.json({
    supabaseUrl: config.supabaseUrl ?? "",
    supabaseServiceKey: maskApiKey(config.supabaseServiceKey),
    postgresUrl: maskApiKey(config.postgresUrl),
  });
});

app.post("/db-config", withErrorHandling("settings/db-config", async (c) => {
  const body = await c.req.json<{
    supabaseUrl?: string;
    supabaseServiceKey?: string;
    postgresUrl?: string;
  }>();

  const current = getDbConfig();
  const updated = {
    supabaseUrl: body.supabaseUrl !== undefined ? body.supabaseUrl : current.supabaseUrl,
    supabaseServiceKey: body.supabaseServiceKey !== undefined && !isMaskedKey(body.supabaseServiceKey)
      ? body.supabaseServiceKey
      : current.supabaseServiceKey,
    postgresUrl: body.postgresUrl !== undefined && !isMaskedKey(body.postgresUrl)
      ? body.postgresUrl
      : current.postgresUrl,
  };

  setDbConfig(updated);

  const currentMode = getCurrentMode();
  if (currentMode === "cloud" || currentMode === "postgres") {
    await switchStorageMode(currentMode);
  }

  return c.json({ success: true, message: "数据库外接配置已保存并应用" });
}));

app.post("/db-config/test", withErrorHandling("settings/db-config/test", async (c) => {
  const body = await c.req.json<{
    type: "supabase" | "postgres";
    supabaseUrl?: string;
    supabaseServiceKey?: string;
    postgresUrl?: string;
  }>();

  const current = getDbConfig();
  const startTime = Date.now();

  if (body.type === "supabase") {
    const url = body.supabaseUrl || current.supabaseUrl;
    const key = body.supabaseServiceKey && !isMaskedKey(body.supabaseServiceKey)
      ? body.supabaseServiceKey
      : current.supabaseServiceKey;

    if (!url || !key) {
      return c.json({ success: false, error: "未配置 Supabase URL 或 Key" }, 400);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const latencyMs = Date.now() - startTime;
    if (resp.ok) {
      return c.json({ success: true, latencyMs });
    } else {
      return c.json({ success: false, error: `Supabase 返回异常: ${resp.status} ${resp.statusText}`, latencyMs });
    }
  } else {
    const connectionString = body.postgresUrl && !isMaskedKey(body.postgresUrl)
      ? body.postgresUrl
      : current.postgresUrl || env.DATABASE_URL;

    if (!connectionString) {
      return c.json({ success: false, error: "未配置 PostgreSQL 连接 URL" }, 400);
    }

    const client = new pg.Client({
      connectionString,
      connectionTimeoutMillis: 5000,
    });

    await client.connect();
    await client.query("SELECT 1;");
    await client.end();

    const latencyMs = Date.now() - startTime;
    return c.json({ success: true, latencyMs });
  }
}));

app.post("/db-config/migrate", withErrorHandling("settings/db-config/migrate", async (c) => {
  const current = getDbConfig();
  const connectionString = current.postgresUrl || env.DATABASE_URL;

  if (!connectionString) {
    return c.json({ success: false, error: "未配置 PostgreSQL 连接 URL" }, 400);
  }

  const client = new pg.Client({ connectionString });

  try {
    await client.connect();
    await client.query(POSTGRES_MIGRATION_DDL);
    await client.end();
    return c.json({ success: true, message: "所有数据表结构（Tasks, Conversations, Memories etc.）已成功自动初始化！" });
  } catch (err) {
    try { await client.end(); } catch { /* cleanup is best-effort */ }
    throw err;
  }
}));

// ---- Database Diagnostic Stats ----

app.get("/db-stats", withErrorHandling("settings/db-stats", async (c) => {
  const mode = getCurrentMode();
  let dbSize = "0 KB";
  const entryCount = { conversations: 0, tasks: 0, articles: 0 };

  if (mode === "local") {
    try {
      const stats = fs.statSync(resolveAppPaths().sqlitePath);
      const sizeInKb = stats.size / 1024;
      dbSize = sizeInKb > 1024
        ? `${(sizeInKb / 1024).toFixed(2)} MB`
        : `${sizeInKb.toFixed(2)} KB`;
    } catch {
      dbSize = "未就绪 (未创建)";
    }
  } else {
    dbSize = "云端托管";
  }

  try {
    const repos = getRepositories();
    const conversations = await repos.conversations.list();
    entryCount.conversations = conversations.length;

    const tasks = await repos.tasks.query();
    entryCount.tasks = tasks.length;

    const reading = await repos.articles.list();
    entryCount.articles = reading.length;
  } catch (e) {
    console.warn("Failed to get DB records counts:", e);
  }

  return c.json({
    success: true,
    dbSize,
    entryCount,
  });
}));

// ---- Database Manager Endpoints ----

app.get("/db-manager/tables", withErrorHandling("settings/db-manager/tables", async (c) => {
  const registry = getTableRegistry();
  const tables = await Promise.all(
    Object.entries(registry).map(async ([id, entry]) => ({
      id,
      name: entry.label,
      description: entry.description,
      count: (await entry.list()).length,
    }))
  );

  return c.json({ success: true, tables });
}));

app.get("/db-manager/tables/:name", withErrorHandling("settings/db-manager/table-rows", async (c) => {
  const name = c.req.param("name")!;
  const registry = getTableRegistry();
  const entry = registry[name];

  if (!entry) {
    return apiError(c, `不支持的表名: ${name}`, 400);
  }

  const rows = await entry.list();
  return c.json({ success: true, rows });
}));

app.delete("/db-manager/tables/:name/:id", withErrorHandling("settings/db-manager/delete-row", async (c) => {
  const name = c.req.param("name")!;
  const id = c.req.param("id")!;
  const registry = getTableRegistry();
  const entry = registry[name];

  if (!entry) {
    return apiError(c, `不支持的表名: ${name}`, 400);
  }

  const deleted = await entry.delete(id);
  return c.json({ success: true, deleted });
}));

app.post("/db-manager/tables/:name/clear", withErrorHandling("settings/db-manager/clear-table", async (c) => {
  const name = c.req.param("name")!;
  const registry = getTableRegistry();
  const entry = registry[name];

  if (!entry) {
    return apiError(c, `不支持的表名: ${name}`, 400);
  }

  const count = await entry.clear();
  return c.json({ success: true, message: `成功清空 ${name} 表数据，共删除 ${count} 条记录` });
}));

export default app;
