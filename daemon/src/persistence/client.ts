import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { resolveAppPaths, ensureAppDirs } from "../config/app-paths.js";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { migrateAgentRunsStatusConstraint } from "./sqlite/agent-runs-migration.js";
import { migrateApprovalRequestsStatusConstraint } from "./sqlite/approval-status-migration.js";
import { migrateMessageFts } from "./sqlite/message-fts-migration.js";

type BetterSqlite3Constructor = new (
  filename: string,
  options?: import("better-sqlite3").Options,
) => import("better-sqlite3").Database;

const appPaths = resolveAppPaths();
ensureAppDirs(appPaths);
const dbPath = appPaths.sqlitePath;
mkdirSync(dirname(dbPath), { recursive: true });

const sidecarModuleRoot = process.env.JARVIS_SIDECAR_MODULE_ROOT || dirname(process.execPath);
const requireFromSidecarDir = createRequire(join(sidecarModuleRoot, "package.json"));
const Database = requireFromSidecarDir("better-sqlite3") as BetterSqlite3Constructor;
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
const db: BetterSQLite3Database<typeof schema> = drizzle(sqlite, { schema });

// Create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 3,
    status TEXT DEFAULT 'pending',
    due_date TEXT,
    tags TEXT,
    completed_at TEXT,
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
    created_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'default',
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
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL DEFAULT '',
    tool_calls TEXT,
    tool_call_id TEXT,
    parent_message_id TEXT,
    token_count INTEGER,
    model_used TEXT,
    created_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

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

  CREATE INDEX IF NOT EXISTS idx_tool_call_logs_conversation ON tool_call_logs(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_tool_call_logs_tool ON tool_call_logs(tool_id);

  CREATE TABLE IF NOT EXISTS app_connections (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL UNIQUE,
    app_name TEXT NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('mcp', 'native', 'skill', 'rest')),
    config TEXT,
    status TEXT NOT NULL DEFAULT 'disconnected' CHECK(status IN ('disconnected', 'connecting', 'connected', 'error')),
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
    last_injected_at TEXT,
    expires_at TEXT,
    created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
    updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
  );

  CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id, type);
  CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key);

  CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    user_message_id TEXT,
    assistant_message_id TEXT,
    status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'waiting_for_approval')),
    selected_model TEXT,
    route_reason TEXT,
    tool_call_count INTEGER DEFAULT 0,
    started_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
    completed_at TEXT,
    duration_ms INTEGER,
    error TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_agent_runs_conversation ON agent_runs(conversation_id);
`);

// Migration: add `uses` column to memories if it doesn't exist (Phase 4)
try {
  sqlite.exec(`ALTER TABLE memories ADD COLUMN uses INTEGER DEFAULT 0`);
} catch {
  // Column already exists — ignore
}

// Migration: add token tracking columns to conversations (Phase 12)
try {
  sqlite.exec(`ALTER TABLE conversations ADD COLUMN prompt_tokens INTEGER DEFAULT 0`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE conversations ADD COLUMN completion_tokens INTEGER DEFAULT 0`);
} catch {
  // Column already exists — ignore
}

// Migration: add `tier` column to memories (Phase 13)
try {
  sqlite.exec(`ALTER TABLE memories ADD COLUMN tier TEXT NOT NULL DEFAULT 'context'`);
} catch {
  // Column already exists — ignore
}

// Migration: add parent_message_id to messages (Phase 15)
try {
  sqlite.exec(`ALTER TABLE messages ADD COLUMN parent_message_id TEXT`);
} catch {
  // Column already exists — ignore
}

// Migration: add compressed flag to messages (context compression)
try {
  sqlite.exec(`ALTER TABLE messages ADD COLUMN compressed INTEGER NOT NULL DEFAULT 0`);
} catch {
  // Column already exists — ignore
}

// Migration: add model_used to messages (Phase 16 - Premium Design)
try {
  sqlite.exec(`ALTER TABLE messages ADD COLUMN model_used TEXT`);
} catch {
  // Column already exists — ignore
}

// Migration: add spec, tech_stack, and root_path to projects
try {
  sqlite.exec(`ALTER TABLE projects ADD COLUMN spec TEXT`);
} catch {
  // Column already exists.
}
try {
  sqlite.exec(`ALTER TABLE projects ADD COLUMN tech_stack TEXT`);
} catch {
  // Column already exists.
}
try {
  sqlite.exec(`ALTER TABLE projects ADD COLUMN root_path TEXT`);
} catch {
  // Column already exists.
}

// Migration: clean up legacy '*🤖 via' footers in message content and set model_used structurally
try {
  const stmt = sqlite.prepare("SELECT id, content, model_used FROM messages WHERE role = 'assistant' AND content LIKE '%\n\n*🤖 via %*'");
  const rows = stmt.all() as { id: string; content: string; model_used: string | null }[];
  if (rows.length > 0) {
    const updateStmt = sqlite.prepare("UPDATE messages SET content = ?, model_used = ? WHERE id = ?");
    for (const row of rows) {
      const index = row.content.lastIndexOf("\n\n*🤖 via ");
      if (index !== -1) {
        const cleanContent = row.content.substring(0, index);
        const footerStart = index + "\n\n*🤖 via ".length;
        const footerEnd = row.content.lastIndexOf("*");
        let modelUsed = row.model_used;
        if (!modelUsed && footerEnd > footerStart) {
          modelUsed = row.content.substring(footerStart, footerEnd);
        }
        updateStmt.run(cleanContent, modelUsed, row.id);
      }
    }
    console.info(`[Migration] Cleaned up ${rows.length} legacy message footers and migrated to model_used column.`);
  }
} catch (err) {
  console.error("[Migration] Failed to clean up legacy message footers:", err);
}

// Migration: add missing columns to memories for existing databases
try { sqlite.exec(`ALTER TABLE memories ADD COLUMN scope_type TEXT NOT NULL DEFAULT 'user'`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE memories ADD COLUMN scope_id TEXT`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE memories ADD COLUMN last_injected_at TEXT`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE memories ADD COLUMN source_run_id TEXT`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE memories ADD COLUMN source_message_id TEXT`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE memories ADD COLUMN last_verified_at TEXT`); } catch {} // eslint-disable-line no-empty

// Migration: add missing columns to tasks for existing databases
try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN workspace_id TEXT`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN project_id TEXT`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN objective TEXT`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN assigned_agent_id TEXT`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN parent_task_id TEXT`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN dependencies TEXT DEFAULT '[]'`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN blocked_by TEXT DEFAULT '[]'`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN acceptance_criteria TEXT DEFAULT '[]'`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN artifacts TEXT DEFAULT '[]'`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN run_history TEXT DEFAULT '[]'`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN manual_intervention_required INTEGER DEFAULT 0`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN rollback_plan TEXT`); } catch {} // eslint-disable-line no-empty

// Migration: add missing columns to agent_runs for existing databases
try { sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN workspace_id TEXT`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN project_id TEXT`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN task_id TEXT`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN agent_id TEXT`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN mode TEXT NOT NULL DEFAULT 'chat'`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN selected_tools TEXT DEFAULT '[]'`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN memory_reads TEXT DEFAULT '[]'`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN memory_writes TEXT DEFAULT '[]'`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN tool_calls TEXT DEFAULT '[]'`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN artifacts TEXT DEFAULT '[]'`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN approvals TEXT DEFAULT '[]'`); } catch {} // eslint-disable-line no-empty

// Migration: add queued/waiting_for_approval to agent_runs CHECK constraint.
try {
  migrateAgentRunsStatusConstraint(sqlite);
} catch (err) {
  console.error("[Jarvis] Failed to migrate agent_runs status constraint:", err);
}

// Migration: add executing/succeeded/failed to approval_requests CHECK constraint
try {
  migrateApprovalRequestsStatusConstraint(sqlite);
} catch (err) {
  console.error("[Jarvis] Failed to migrate approval_requests status constraint:", err);
}

// Migration: add missing columns to conversations for existing databases
try { sqlite.exec(`ALTER TABLE conversations ADD COLUMN workspace_id TEXT`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE conversations ADD COLUMN project_id TEXT`); } catch {} // eslint-disable-line no-empty

// Migration: FTS5 for message search (Phase 15)
migrateMessageFts(sqlite);

// Migration: FTS5 for memory search
sqlite.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    key, value, type, content_rowid='rowid'
  );

  CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, key, value, type)
    VALUES (new.rowid, new.key, new.value, new.type);
  END;

  CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, key, value, type)
    VALUES('delete', old.rowid, old.key, old.value, old.type);
  END;

  CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, key, value, type)
    VALUES('delete', old.rowid, old.key, old.value, old.type);
    INSERT INTO memories_fts(rowid, key, value, type)
    VALUES (new.rowid, new.key, new.value, new.type);
  END;
`);

// Migration: create scheduled_tasks table (Phase 14)
sqlite.exec(`
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

  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'default',
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed', 'abandoned')),
    progress TEXT,
    created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
    updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
  );
`);

// Migration: Phase 1 - Data Foundation (Workspace, Project, AgentProfile)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'Default Workspace',
    description TEXT,
    owner_id TEXT NOT NULL,
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
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived', 'completed')),
    settings TEXT,
    created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
    updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
  );

  CREATE TABLE IF NOT EXISTS agent_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    model_policy TEXT NOT NULL DEFAULT '{}',
    skills TEXT NOT NULL DEFAULT '[]',
    tools TEXT NOT NULL DEFAULT '[]',
    knowledge_scopes TEXT NOT NULL DEFAULT '[]',
    permissions TEXT NOT NULL DEFAULT '[]',
    memory_scopes TEXT NOT NULL DEFAULT '[]',
    executor_policy TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
    updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
  );

  CREATE INDEX IF NOT EXISTS idx_projects_workspace_id ON projects(workspace_id);
`);

// Migration: add `executor_policy` column to existing agent_profiles tables
try { sqlite.exec(`ALTER TABLE agent_profiles ADD COLUMN executor_policy TEXT`); } catch {} // eslint-disable-line no-empty

// Migration: extend agent_runs table (Phase 1)
try {
  sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN project_id TEXT REFERENCES projects(id)`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN task_id TEXT`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN agent_id TEXT REFERENCES agent_profiles(id)`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN mode TEXT NOT NULL DEFAULT 'chat'`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN selected_tools TEXT DEFAULT '[]'`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN memory_reads TEXT DEFAULT '[]'`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN memory_writes TEXT DEFAULT '[]'`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN tool_calls TEXT DEFAULT '[]'`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN artifacts TEXT DEFAULT '[]'`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN approvals TEXT DEFAULT '[]'`);
} catch {
  // Column already exists — ignore
}

// Migration: extend conversations table (Phase 1)
try {
  sqlite.exec(`ALTER TABLE conversations ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE conversations ADD COLUMN project_id TEXT REFERENCES projects(id)`);
} catch {
  // Column already exists — ignore
}

// Migration: extend tasks table (Phase 1)
try {
  sqlite.exec(`ALTER TABLE tasks ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE tasks ADD COLUMN project_id TEXT REFERENCES projects(id)`);
} catch {
  // Column already exists — ignore
}

// Migration: Phase 6 - Task Graph
try {
  sqlite.exec(`ALTER TABLE tasks ADD COLUMN objective TEXT`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE tasks ADD COLUMN assigned_agent_id TEXT REFERENCES agent_profiles(id)`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE tasks ADD COLUMN parent_task_id TEXT`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE tasks ADD COLUMN dependencies JSON DEFAULT '[]'`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE tasks ADD COLUMN blocked_by JSON DEFAULT '[]'`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE tasks ADD COLUMN acceptance_criteria JSON DEFAULT '[]'`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE tasks ADD COLUMN artifacts JSON DEFAULT '[]'`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE tasks ADD COLUMN run_history JSON DEFAULT '[]'`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE tasks ADD COLUMN manual_intervention_required BOOLEAN DEFAULT 0`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE tasks ADD COLUMN rollback_plan TEXT`);
} catch {
  // Column already exists — ignore
}

// Indexes for task graph queries
sqlite.exec(`
  CREATE INDEX IF NOT EXISTS idx_tasks_parent_task ON tasks(parent_task_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent ON tasks(assigned_agent_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
`);

// Migration: Phase 2 - Memory Scope
try {
  sqlite.exec(`ALTER TABLE memories ADD COLUMN scope_type TEXT NOT NULL DEFAULT 'user' CHECK(scope_type IN ('user', 'workspace', 'project', 'agent', 'task', 'conversation'))`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE memories ADD COLUMN scope_id TEXT`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE memories ADD COLUMN source_run_id TEXT`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE memories ADD COLUMN source_message_id TEXT`);
} catch {
  // Column already exists — ignore
}
try {
  sqlite.exec(`ALTER TABLE memories ADD COLUMN last_verified_at TEXT`);
} catch {
  // Column already exists — ignore
}

// Migration: Phase 4 - Tool Permissions (approval_requests, permission_memories)
sqlite.exec(`
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
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
  CREATE INDEX IF NOT EXISTS idx_approval_requests_run ON approval_requests(run_id);

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

  CREATE INDEX IF NOT EXISTS idx_permission_memories_user ON permission_memories(user_id, tool_id);
  CREATE INDEX IF NOT EXISTS idx_permission_memories_project ON permission_memories(project_id, tool_id);
`);

// Migration: Phase 3 - Approval hardening (mode, source, preview, tool_call_id, expires_at)
try { sqlite.exec(`ALTER TABLE approval_requests ADD COLUMN mode TEXT DEFAULT 'chat'`); } catch { /* already exists */ }
try { sqlite.exec(`ALTER TABLE approval_requests ADD COLUMN source TEXT`); } catch { /* already exists */ }
try { sqlite.exec(`ALTER TABLE approval_requests ADD COLUMN preview TEXT`); } catch { /* already exists */ }
try { sqlite.exec(`ALTER TABLE approval_requests ADD COLUMN tool_call_id TEXT`); } catch { /* already exists */ }
try { sqlite.exec(`ALTER TABLE approval_requests ADD COLUMN expires_at INTEGER`); } catch { /* already exists */ }

// Migration: Phase B — approval resume payload
try { sqlite.exec(`ALTER TABLE approval_requests ADD COLUMN operation_kind TEXT`); } catch { /* already exists */ }
try { sqlite.exec(`ALTER TABLE approval_requests ADD COLUMN operation_payload TEXT`); } catch { /* already exists */ }

// Migration: Permission memory session scope — add run_id column
try { sqlite.exec(`ALTER TABLE permission_memories ADD COLUMN run_id TEXT`); } catch { /* already exists */ }
try { sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_permission_memories_session ON permission_memories(tool_id, user_id, run_id, scope)`); } catch { /* already exists */ }

// Migration: Phase 7 - Agent Run Event Store
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS agent_run_events (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES agent_runs(id),
    sequence INTEGER NOT NULL,
    type TEXT NOT NULL,
    payload TEXT,
    created_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
  );

  CREATE INDEX IF NOT EXISTS idx_agent_run_events_run ON agent_run_events(run_id, sequence);
`);

// Migration: Phase 9 - EventLog and AuditLog
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS event_log (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    project_id TEXT,
    task_id TEXT,
    agent_run_id TEXT,
    runtime_id TEXT,
    payload TEXT,
    created_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
  );

  CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(type);
  CREATE INDEX IF NOT EXISTS idx_event_log_created ON event_log(created_at);

  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    risk_level TEXT,
    permission_decision TEXT,
    confirmed_by_user INTEGER,
    result TEXT,
    metadata TEXT,
    created_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
  );

  CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
  CREATE INDEX IF NOT EXISTS idx_audit_log_risk ON audit_log(risk_level);
  CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
`);

// Migration: UI Redesign - Backend Domain Model Alignment (Phase 2)
// Add role, capabilities, enabled to agent_profiles
try { sqlite.exec(`ALTER TABLE agent_profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'general'`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE agent_profiles ADD COLUMN capabilities TEXT NOT NULL DEFAULT '[]'`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE agent_profiles ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1`); } catch {} // eslint-disable-line no-empty

// Add goal, status, active_project_id, completed_at to workspaces
try { sqlite.exec(`ALTER TABLE workspaces ADD COLUMN goal TEXT`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE workspaces ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE workspaces ADD COLUMN active_project_id TEXT`); } catch {} // eslint-disable-line no-empty
try { sqlite.exec(`ALTER TABLE workspaces ADD COLUMN completed_at TEXT`); } catch {} // eslint-disable-line no-empty

// Create workspace_agents table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS workspace_agents (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    agent_profile_id TEXT NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
    role_in_workspace TEXT NOT NULL DEFAULT 'builder' CHECK(role_in_workspace IN ('owner', 'planner', 'builder', 'reviewer', 'tester', 'observer')),
    status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle', 'running', 'completed', 'failed', 'blocked')),
    current_task_id TEXT,
    joined_at TEXT NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
    left_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_workspace_agents_workspace ON workspace_agents(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_workspace_agents_agent ON workspace_agents(agent_profile_id);
`);

// Create artifacts table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id TEXT REFERENCES projects(id),
    task_id TEXT,
    run_id TEXT,
    type TEXT NOT NULL CHECK(type IN ('spec', 'plan', 'file', 'report', 'scaffold')),
    title TEXT NOT NULL,
    path TEXT,
    content TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
  );

  CREATE INDEX IF NOT EXISTS idx_artifacts_workspace ON artifacts(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project_id);
`);

// Migration: Executor Runs (Agent-Native Execution - Session 2)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS executor_runs (
    id TEXT PRIMARY KEY,
    agent_run_id TEXT REFERENCES agent_runs(id),
    workspace_id TEXT REFERENCES workspaces(id),
    project_id TEXT REFERENCES projects(id),
    task_id TEXT,
    agent_id TEXT REFERENCES agent_profiles(id),
    adapter_id TEXT NOT NULL,
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
  CREATE INDEX IF NOT EXISTS idx_executor_runs_adapter ON executor_runs(adapter_id);
`);

// Migration: Environment Sessions and Events (Agent-Native Execution - Session 7)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS environment_sessions (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id TEXT REFERENCES projects(id),
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

  CREATE TABLE IF NOT EXISTS execution_logs (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    executor_run_id TEXT,
    workspace_id TEXT,
    project_id TEXT,
    task_id TEXT,
    stream TEXT NOT NULL CHECK(stream IN ('stdout', 'stderr', 'system', 'executor')),
    sequence INTEGER NOT NULL,
    content TEXT NOT NULL,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
  );

  CREATE INDEX IF NOT EXISTS idx_exec_logs_run ON execution_logs(run_id, sequence);
  CREATE INDEX IF NOT EXISTS idx_exec_logs_workspace ON execution_logs(workspace_id);

  CREATE INDEX IF NOT EXISTS idx_env_sessions_workspace ON environment_sessions(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_env_sessions_run ON environment_sessions(run_id);
  CREATE INDEX IF NOT EXISTS idx_env_sessions_state ON environment_sessions(state);

  CREATE TABLE IF NOT EXISTS environment_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES environment_sessions(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL,
    type TEXT NOT NULL,
    payload TEXT,
    created_at TEXT NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
  );

  CREATE INDEX IF NOT EXISTS idx_env_events_session ON environment_events(session_id, sequence);

  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    goal_id TEXT REFERENCES goals(id),
    workspace_id TEXT REFERENCES workspaces(id),
    version INTEGER NOT NULL DEFAULT 1,
    strategy TEXT NOT NULL,
    task_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'completed', 'superseded')),
    metadata TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
    updated_at TEXT NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
  );

  CREATE INDEX IF NOT EXISTS idx_plans_goal ON plans(goal_id);
  CREATE INDEX IF NOT EXISTS idx_plans_workspace ON plans(workspace_id);
`);

export { db };
export { schema };
