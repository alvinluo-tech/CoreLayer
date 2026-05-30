import { Hono } from "hono";
import fs from "fs";
import { env } from "../config/env.js";
import {
  setStorageMode,
  isCloudConfigured,
  getProviderCredentials,
  setProviderCredential,
  getProviders,
  setProvider,
  removeProvider,
  getRoutingRules,
  setRoutingRules,
  getActiveModelId,
  setActiveModelId,
  getDbConfig,
  setDbConfig,
  type StoredProvider,
} from "../config/storage-config.js";
import pg from "pg";
import { switchStorageMode, getCurrentMode } from "../db/factory.js";
import { getRepositories } from "../db/factory.js";
import { resetGateway, getModelGateway } from "../model/gateway.js";
import { DEFAULT_ROUTING_RULES, PROVIDER_PRESETS } from "@jarvis/model-gateway";

const app = new Hono();

// ---- Storage Mode ----

app.get("/", (c) => {
  return c.json({
    storageMode: getCurrentMode(),
    availableModes: ["local", "cloud", "postgres"],
    cloudConfigured: isCloudConfigured(),
    postgresConfigured: !!env.DATABASE_URL,
  });
});

app.put("/storage-mode", async (c) => {
  const body = await c.req.json<{ mode: string }>();

  if (body.mode !== "local" && body.mode !== "cloud" && body.mode !== "postgres") {
    return c.json({ error: "Invalid mode. Must be 'local', 'cloud' or 'postgres'." }, 400);
  }

  if (body.mode === "cloud" && !isCloudConfigured()) {
    return c.json({
      error: "Cloud mode requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be configured.",
    }, 400);
  }

  const dbConfig = getDbConfig();
  if (body.mode === "postgres" && !env.DATABASE_URL && !dbConfig.postgresUrl) {
    return c.json({
      error: "PostgreSQL 模式需要配置 DATABASE_URL 环境变量或在外接数据库中配置连接串。",
    }, 400);
  }

  setStorageMode(body.mode as "local" | "cloud" | "postgres");
  await switchStorageMode(body.mode as "local" | "cloud" | "postgres");

  return c.json({
    storageMode: body.mode,
    message: `Storage mode switched to ${body.mode}.`,
  });
});

// ---- Dynamic Database Configuration Endpoints ----

app.get("/db-config", (c) => {
  const config = getDbConfig();
  return c.json({
    supabaseUrl: config.supabaseUrl ?? "",
    supabaseServiceKey: maskApiKey(config.supabaseServiceKey),
    postgresUrl: maskApiKey(config.postgresUrl),
  });
});

app.post("/db-config", async (c) => {
  try {
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
    
    // Dynamically hot-switch repositories if currently active mode is cloud/postgres
    const currentMode = getCurrentMode();
    if (currentMode === "cloud" || currentMode === "postgres") {
      await switchStorageMode(currentMode);
    }
    
    return c.json({ success: true, message: "数据库外接配置已保存并应用" });
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 500);
  }
});

app.post("/db-config/test", async (c) => {
  try {
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
        return c.json({ success: false, error: "未配置 Supabase URL 或 Key" });
      }

      // Test Supabase connection via health check REST API call
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
        return c.json({ success: false, error: "未配置 PostgreSQL 连接 URL" });
      }

      // Test general PostgreSQL connection
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
  } catch (e) {
    return c.json({ success: false, error: `连接测试失败: ${String(e)}` });
  }
});

app.post("/db-config/migrate", async (c) => {
  const current = getDbConfig();
  const connectionString = current.postgresUrl || env.DATABASE_URL;

  if (!connectionString) {
    return c.json({ success: false, error: "未配置 PostgreSQL 连接 URL" }, 400);
  }

  const client = new pg.Client({ connectionString });
  
  try {
    await client.connect();
    
    // Execute table migrations
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
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
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        source TEXT,
        confidence REAL,
        expires_at TEXT,
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
    `);
    
    await client.end();
    return c.json({ success: true, message: "所有数据表结构（Tasks, Conversations, Memories etc.）已成功自动初始化！" });
  } catch (err) {
    try { await client.end(); } catch {}
    return c.json({ success: false, error: `初始化数据库表失败: ${String(err)}` }, 500);
  }
});

// ---- Database Diagnostic Stats ----

app.get("/db-stats", async (c) => {
  try {
    const mode = getCurrentMode();
    let dbSize = "0 KB";
    let entryCount = { conversations: 0, tasks: 0, articles: 0 };
    
    if (mode === "local") {
      try {
        const stats = fs.statSync(env.SQLITE_DB_PATH);
        const sizeInKb = stats.size / 1024;
        dbSize = sizeInKb > 1024 
          ? `${(sizeInKb / 1024).toFixed(2)} MB` 
          : `${sizeInKb.toFixed(2)} KB`;
      } catch (err) {
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
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// ---- Database Manager Endpoints ----

app.get("/db-manager/tables", async (c) => {
  try {
    const repos = getRepositories();
    const conversations = await repos.conversations.list();
    const tasks = await repos.tasks.query();
    const articles = await repos.articles.list();
    const memories = await repos.memories.getAll();

    return c.json({
      success: true,
      tables: [
        {
          id: "conversations",
          name: "会话历史 (Conversations)",
          description: "Jarvis 与您的所有对话交互记录",
          count: conversations.length,
        },
        {
          id: "tasks",
          name: "任务列表 (Tasks)",
          description: "日常待办事项及执行状态跟踪记录",
          count: tasks.length,
        },
        {
          id: "articles",
          name: "阅读文章 (Articles)",
          description: "收藏待阅的网页文章、剪贴板记录等",
          count: articles.length,
        },
        {
          id: "memories",
          name: "记忆胶囊 (Memories)",
          description: "提取的结构化长期记忆和个人偏好",
          count: memories.length,
        },
      ],
    });
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 500);
  }
});

app.get("/db-manager/tables/:name", async (c) => {
  try {
    const name = c.req.param("name");
    const repos = getRepositories();
    let rows: unknown[] = [];

    if (name === "conversations") {
      rows = await repos.conversations.list();
    } else if (name === "tasks") {
      rows = await repos.tasks.query();
    } else if (name === "articles") {
      rows = await repos.articles.list();
    } else if (name === "memories") {
      rows = await repos.memories.getAll();
    } else {
      return c.json({ success: false, error: `不支持的表名: ${name}` }, 400);
    }

    return c.json({ success: true, rows });
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 500);
  }
});

app.delete("/db-manager/tables/:name/:id", async (c) => {
  try {
    const name = c.req.param("name");
    const id = c.req.param("id");
    const repos = getRepositories();
    let success = false;

    if (name === "conversations") {
      success = await repos.conversations.delete(id);
    } else if (name === "tasks") {
      success = await repos.tasks.delete(id);
    } else if (name === "articles") {
      success = await repos.articles.delete(id);
    } else if (name === "memories") {
      success = await repos.memories.delete(id);
    } else {
      return c.json({ success: false, error: `不支持的表名: ${name}` }, 400);
    }

    return c.json({ success: true, deleted: success });
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 500);
  }
});

app.post("/db-manager/tables/:name/clear", async (c) => {
  try {
    const name = c.req.param("name");
    const repos = getRepositories();

    if (name === "conversations") {
      const list = await repos.conversations.list();
      for (const item of list) {
        await repos.conversations.delete(item.id);
      }
    } else if (name === "tasks") {
      const list = await repos.tasks.query();
      for (const item of list) {
        await repos.tasks.delete(item.id);
      }
    } else if (name === "articles") {
      const list = await repos.articles.list();
      for (const item of list) {
        await repos.articles.delete(item.id);
      }
    } else if (name === "memories") {
      const list = await repos.memories.getAll();
      for (const item of list) {
        await repos.memories.delete(item.id);
      }
    } else {
      return c.json({ success: false, error: `不支持的表名: ${name}` }, 400);
    }

    return c.json({ success: true, message: `成功清空 ${name} 表数据` });
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 500);
  }
});


// ---- Provider Helpers ----

function maskApiKey(key: string | undefined): string {
  if (!key || key === "ollama" || key.length <= 4) return key ?? "";
  return "*".repeat(key.length - 4) + key.slice(-4);
}

function isMaskedKey(key: string): boolean {
  return /^\*{4,}/.test(key);
}

// ---- Provider Presets ----

app.get("/providers/presets", (c) => {
  return c.json({ presets: PROVIDER_PRESETS });
});

// ---- Providers CRUD ----

app.get("/providers", (c) => {
  const stored = getProviders();
  const creds = getProviderCredentials();

  // If no stored providers, return legacy format for backward compat
  if (stored.length === 0) {
    const providers: Record<string, { apiKey: string; baseURL: string; enabled: boolean }> = {};
    const defaults: Record<string, { baseURL: string }> = {
      mimo: { baseURL: "https://token-plan-ams.xiaomimimo.com/v1" },
      groq: { baseURL: "https://api.groq.com/openai/v1" },
      openrouter: { baseURL: "https://openrouter.ai/api/v1" },
      local: { baseURL: "http://localhost:11434/v1" },
    };

    for (const [name, def] of Object.entries(defaults)) {
      const ui = creds[name];
      providers[name] = {
        apiKey: maskApiKey(ui?.apiKey),
        baseURL: ui?.baseURL ?? def.baseURL,
        enabled: true,
      };
    }

    return c.json({ providers, isLegacy: true });
  }

  // New format: return stored providers with masked keys
  const providers = stored.map((p) => ({
    ...p,
    apiKey: maskApiKey(p.apiKey),
  }));

  return c.json({ providers, isLegacy: false });
});

app.post("/providers", async (c) => {
  const body = await c.req.json<{
    id: string;
    name: string;
    type?: string;
    baseURL: string;
    apiKey?: string;
    enabled?: boolean;
  }>();

  if (!body.id || !body.name || !body.baseURL) {
    return c.json({ error: "id, name, and baseURL are required" }, 400);
  }

  const provider: Omit<StoredProvider, "id"> = {
    name: body.name,
    type: (body.type as StoredProvider["type"]) ?? "openai_compatible",
    baseURL: body.baseURL,
    apiKey: body.apiKey,
    enabled: body.enabled ?? true,
  };

  setProvider(body.id, provider);
  resetGateway();

  return c.json({ success: true, message: `Provider "${body.name}" added.` });
});

app.put("/providers/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    name?: string;
    baseURL?: string;
    apiKey?: string;
    enabled?: boolean;
  }>();

  const existing = getProviders().find((p) => p.id === id);
  if (existing) {
    // Update stored provider
    const updated: Omit<StoredProvider, "id"> = {
      name: body.name ?? existing.name,
      type: existing.type,
      baseURL: body.baseURL ?? existing.baseURL,
      apiKey: body.apiKey !== undefined && !isMaskedKey(body.apiKey) ? body.apiKey : existing.apiKey,
      enabled: body.enabled ?? existing.enabled,
    };
    setProvider(id, updated);
  } else {
    // Legacy: update via providerCredentials
    const cred: { apiKey?: string; baseURL?: string } = {};
    if (body.apiKey !== undefined && !isMaskedKey(body.apiKey)) {
      cred.apiKey = body.apiKey;
    }
    if (body.baseURL !== undefined) {
      cred.baseURL = body.baseURL;
    }
    setProviderCredential(id, cred);
  }

  resetGateway();
  return c.json({ success: true, message: `Provider "${id}" updated.` });
});

app.delete("/providers/:id", async (c) => {
  const id = c.req.param("id");
  removeProvider(id);
  resetGateway();
  return c.json({ success: true });
});

// ---- Model Discovery ----

app.post("/providers/:id/discover", async (c) => {
  const id = c.req.param("id");
  const stored = getProviders().find((p) => p.id === id);

  let baseURL: string;
  let apiKey: string;

  if (stored) {
    baseURL = stored.baseURL;
    apiKey = stored.apiKey ?? "";
  } else {
    return c.json({ error: `Provider "${id}" not found. Add it first.` }, 404);
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey && apiKey !== "ollama") {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const resp = await fetch(`${baseURL}/models`, { headers });

    if (!resp.ok) {
      return c.json({
        error: `Failed to fetch models: ${resp.status} ${resp.statusText}`,
      }, 502);
    }

    const data = await resp.json() as { data?: { id: string; name?: string }[] };
    const models = (data.data ?? []).map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
    }));

    return c.json({ models });
  } catch (e) {
    return c.json({ error: `Connection failed: ${String(e)}` }, 502);
  }
});

// ---- Provider Connectivity Test ----

app.post("/providers/:id/test", async (c) => {
  const id = c.req.param("id");
  const stored = getProviders().find((p) => p.id === id);

  if (!stored) {
    return c.json({ error: `Provider "${id}" not found.` }, 404);
  }

  const startTime = Date.now();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (stored.apiKey && stored.apiKey !== "ollama" && !isMaskedKey(stored.apiKey)) {
      headers["Authorization"] = `Bearer ${stored.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

    const resp = await fetch(`${stored.baseURL}/models`, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const latencyMs = Date.now() - startTime;

    if (resp.status === 401 || resp.status === 403) {
      return c.json({ success: false, error: "API Key 校验失败 (401 Unauthorized)", latencyMs });
    }

    if (!resp.ok) {
      return c.json({ success: false, error: `服务器返回异常: ${resp.status} ${resp.statusText}`, latencyMs });
    }

    return c.json({ success: true, latencyMs });
  } catch (e) {
    const latencyMs = Date.now() - startTime;
    return c.json({ success: false, error: `连接超时或 URL 错误: ${String(e)}`, latencyMs });
  }
});

// ---- Legacy Provider Credentials (backward compat) ----

app.get("/providers/legacy", (c) => {
  const creds = getProviderCredentials();
  const providers: Record<string, { apiKey: string; baseURL: string }> = {};

  const defaults: Record<string, { baseURL: string }> = {
    mimo: { baseURL: "https://token-plan-ams.xiaomimimo.com/v1" },
    groq: { baseURL: "https://api.groq.com/openai/v1" },
    openrouter: { baseURL: "https://openrouter.ai/api/v1" },
    local: { baseURL: "http://localhost:11434/v1" },
  };

  for (const [name, def] of Object.entries(defaults)) {
    const ui = creds[name];
    providers[name] = {
      apiKey: maskApiKey(ui?.apiKey),
      baseURL: ui?.baseURL ?? def.baseURL,
    };
  }

  return c.json({ providers });
});

// ---- Routing Rules ----

app.get("/routing-rules", (c) => {
  const custom = getRoutingRules();
  return c.json({
    rules: custom ?? DEFAULT_ROUTING_RULES,
    isCustom: custom !== undefined,
  });
});

app.put("/routing-rules", async (c) => {
  const body = await c.req.json<{ rules: { taskType: string; modelId: string; conditions?: Record<string, unknown> }[] }>();

  if (!Array.isArray(body.rules)) {
    return c.json({ error: "rules must be an array" }, 400);
  }

  for (const rule of body.rules) {
    if (!rule.taskType || !rule.modelId) {
      return c.json({ error: "Each rule must have taskType and modelId" }, 400);
    }
  }

  setRoutingRules(body.rules);
  resetGateway();

  return c.json({ success: true, message: "Routing rules updated." });
});

// ---- Active Model ----

app.get("/active-model", (c) => {
  const activeId = getActiveModelId();
  const gateway = getModelGateway();
  const profile = activeId ? gateway.getProfile(activeId) : null;

  return c.json({
    modelId: activeId ?? "mimo-2.5-pro",
    profile: profile ?? null,
  });
});

app.put("/active-model", async (c) => {
  const body = await c.req.json<{ modelId: string }>();

  if (!body.modelId) {
    return c.json({ error: "modelId is required" }, 400);
  }

  // Validate the model exists in profiles
  const gateway = getModelGateway();
  const profile = gateway.getProfile(body.modelId);
  if (!profile) {
    const repos = getRepositories();
    const dbProfiles = await repos.modelProfiles.getAll();
    const found = dbProfiles.find((p) => p.id === body.modelId);
    if (!found) {
      return c.json({ error: `Model profile not found: ${body.modelId}` }, 400);
    }
  }

  setActiveModelId(body.modelId);
  resetGateway();

  return c.json({ success: true, message: `Active model set to "${body.modelId}".` });
});

// ---- Model Profiles ----

app.get("/model-profiles", (c) => {
  const gateway = getModelGateway();
  return c.json({ profiles: gateway.getAllProfiles() });
});

app.post("/model-profiles", async (c) => {
  const body = await c.req.json<{
    provider: string;
    modelName: string;
    displayName?: string;
    capabilities?: Record<string, boolean>;
    limits?: { contextWindow: number; maxOutputTokens: number };
    cost?: { input: number; output: number };
    isDefault?: boolean;
  }>();

  if (!body.provider || !body.modelName) {
    return c.json({ error: "provider and modelName are required" }, 400);
  }

  const repos = getRepositories();
  const result = (repos.modelProfiles as { upsert: (input: unknown) => unknown }).upsert(body);
  resetGateway();

  return c.json({ success: true, profile: result });
});

app.delete("/model-profiles/:id", async (c) => {
  const id = c.req.param("id");
  const repos = getRepositories();
  const deleted = await repos.modelProfiles.delete(id);

  if (!deleted) {
    return c.json({ error: "Profile not found" }, 404);
  }

  resetGateway();
  return c.json({ success: true });
});

export default app;
