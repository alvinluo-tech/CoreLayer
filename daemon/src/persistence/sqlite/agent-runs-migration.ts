type SqliteDatabase = import("better-sqlite3").Database;

/**
 * SQLite cannot alter CHECK constraints in place.
 * Rebuild agent_runs when an existing DB still has the old status constraint.
 */
export function migrateAgentRunsStatusConstraint(sqlite: SqliteDatabase): void {
  const tableInfo = sqlite.prepare(`PRAGMA table_info(agent_runs)`).all() as Array<{ name: string }>;
  if (tableInfo.length === 0) return;

  const createSql = sqlite
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='agent_runs'`)
    .get() as { sql: string } | undefined;

  const needsStatusMigration = createSql?.sql
    && (!createSql.sql.includes("'queued'") || !createSql.sql.includes("waiting_for_approval"));

  if (!needsStatusMigration) return;

  // Disable foreign keys temporarily as we need to drop and rename the table
  sqlite.exec(`PRAGMA foreign_keys = OFF`);

  sqlite.exec(`BEGIN TRANSACTION`);
  try {
    sqlite.exec(`CREATE TABLE agent_runs_new (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      workspace_id TEXT,
      project_id TEXT,
      task_id TEXT,
      agent_id TEXT,
      user_message_id TEXT,
      assistant_message_id TEXT,
      status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'waiting_for_approval')),
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
      started_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      completed_at TEXT,
      duration_ms INTEGER,
      error TEXT
    )`);
    sqlite.exec(`
      INSERT INTO agent_runs_new (
        id,
        conversation_id,
        workspace_id,
        project_id,
        task_id,
        agent_id,
        user_message_id,
        assistant_message_id,
        status,
        mode,
        selected_model,
        route_reason,
        selected_tools,
        memory_reads,
        memory_writes,
        tool_calls,
        tool_call_count,
        artifacts,
        approvals,
        started_at,
        completed_at,
        duration_ms,
        error
      )
      SELECT
        id,
        conversation_id,
        workspace_id,
        project_id,
        task_id,
        agent_id,
        user_message_id,
        assistant_message_id,
        CASE
          WHEN status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'waiting_for_approval') THEN status
          ELSE 'running'
        END,
        COALESCE(mode, 'chat'),
        selected_model,
        route_reason,
        COALESCE(selected_tools, '[]'),
        COALESCE(memory_reads, '[]'),
        COALESCE(memory_writes, '[]'),
        COALESCE(tool_calls, '[]'),
        COALESCE(tool_call_count, 0),
        COALESCE(artifacts, '[]'),
        COALESCE(approvals, '[]'),
        started_at,
        completed_at,
        duration_ms,
        error
      FROM agent_runs
    `);
    sqlite.exec(`DROP TABLE agent_runs`);
    sqlite.exec(`ALTER TABLE agent_runs_new RENAME TO agent_runs`);
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_agent_runs_conversation ON agent_runs(conversation_id)`);
    sqlite.exec(`COMMIT`);
  } catch (err) {
    try { sqlite.exec(`ROLLBACK`); } catch {} // eslint-disable-line no-empty
    throw err;
  } finally {
    try {
      sqlite.exec(`PRAGMA foreign_keys = ON`);
    } catch {}
  }
}
