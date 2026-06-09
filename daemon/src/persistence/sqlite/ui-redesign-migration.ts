type SqliteDatabase = import("better-sqlite3").Database;

/**
 * Phase 2: UI Redesign - Backend Domain Model Alignment
 *
 * Adds domain fields needed for agent orchestration:
 * - agent_profiles: role, capabilities, enabled
 * - workspace_agents: new table for agent-to-workspace relationships
 * - workspaces: goal, status, active_project_id, completed_at
 * - artifacts: new table for workspace artifacts
 */
export function migrateUiRedesign(sqlite: SqliteDatabase): void {
  const tables = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as Array<{ name: string }>;
  const tableNames = tables.map((t) => t.name);

  // Skip if already migrated (check for new columns/tables)
  if (tableNames.includes("workspace_agents")) return;

  sqlite.exec(`PRAGMA foreign_keys = OFF`);
  sqlite.exec(`BEGIN TRANSACTION`);

  try {
    // 1. Add columns to agent_profiles
    const agentProfileInfo = sqlite.prepare(`PRAGMA table_info(agent_profiles)`).all() as Array<{ name: string }>;
    const agentProfileCols = agentProfileInfo.map((c) => c.name);

    if (!agentProfileCols.includes("role")) {
      sqlite.exec(`ALTER TABLE agent_profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'general'`);
    }
    if (!agentProfileCols.includes("capabilities")) {
      sqlite.exec(`ALTER TABLE agent_profiles ADD COLUMN capabilities TEXT NOT NULL DEFAULT '[]'`);
    }
    if (!agentProfileCols.includes("enabled")) {
      sqlite.exec(`ALTER TABLE agent_profiles ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1`);
    }

    // 2. Add columns to workspaces
    const workspaceInfo = sqlite.prepare(`PRAGMA table_info(workspaces)`).all() as Array<{ name: string }>;
    const workspaceCols = workspaceInfo.map((c) => c.name);

    if (!workspaceCols.includes("goal")) {
      sqlite.exec(`ALTER TABLE workspaces ADD COLUMN goal TEXT`);
    }
    if (!workspaceCols.includes("status")) {
      sqlite.exec(`ALTER TABLE workspaces ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'`);
    }
    if (!workspaceCols.includes("active_project_id")) {
      sqlite.exec(`ALTER TABLE workspaces ADD COLUMN active_project_id TEXT REFERENCES projects(id)`);
    }
    if (!workspaceCols.includes("completed_at")) {
      sqlite.exec(`ALTER TABLE workspaces ADD COLUMN completed_at TEXT`);
    }

    // 3. Create workspace_agents table
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
      )
    `);

    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_workspace_agents_workspace ON workspace_agents(workspace_id)`);
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_workspace_agents_agent ON workspace_agents(agent_profile_id)`);

    // 4. Create artifacts table
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
      )
    `);

    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_artifacts_workspace ON artifacts(workspace_id)`);
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project_id)`);

    sqlite.exec(`COMMIT`);
  } catch (err) {
    try { sqlite.exec(`ROLLBACK`); } catch {} // eslint-disable-line no-empty
    throw err;
  } finally {
    try {
      sqlite.exec(`PRAGMA foreign_keys = ON`);
    } catch {} // eslint-disable-line no-empty
  }
}
