type SqliteDatabase = import("better-sqlite3").Database;

/**
 * SQLite cannot alter CHECK constraints in place.
 * Rebuild approval_requests when an existing DB still has the old status constraint
 * that lacks 'executing', 'failed', and 'succeeded'.
 */
export function migrateApprovalRequestsStatusConstraint(sqlite: SqliteDatabase): void {
  const tableInfo = sqlite.prepare(`PRAGMA table_info(approval_requests)`).all() as Array<{ name: string }>;
  if (tableInfo.length === 0) return;

  const createSql = sqlite
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='approval_requests'`)
    .get() as { sql: string } | undefined;

  const needsStatusMigration = createSql?.sql
    && (!createSql.sql.includes("'executing'") || !createSql.sql.includes("'succeeded'"));

  if (!needsStatusMigration) return;

  sqlite.exec(`PRAGMA foreign_keys = OFF`);

  sqlite.exec(`BEGIN TRANSACTION`);
  try {
    sqlite.exec(`CREATE TABLE approval_requests_new (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES agent_runs(id),
      tool_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      args TEXT NOT NULL,
      risk TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'denied', 'expired', 'executing', 'succeeded', 'failed')),
      project_scope INTEGER NOT NULL DEFAULT 0,
      decided_at INTEGER,
      created_at INTEGER NOT NULL,
      mode TEXT DEFAULT 'chat',
      source TEXT,
      preview TEXT,
      tool_call_id TEXT,
      expires_at INTEGER,
      operation_kind TEXT,
      operation_payload TEXT
    )`);

    sqlite.exec(`
      INSERT INTO approval_requests_new (
        id, run_id, tool_id, tool_name, args, risk, status,
        project_scope, decided_at, created_at,
        mode, source, preview, tool_call_id, expires_at,
        operation_kind, operation_payload
      )
      SELECT
        id, run_id, tool_id, tool_name, args, risk,
        CASE
          WHEN status IN ('pending', 'approved', 'denied', 'expired', 'executing', 'succeeded', 'failed') THEN status
          ELSE 'pending'
        END,
        COALESCE(project_scope, 0), decided_at, created_at,
        COALESCE(mode, 'chat'), source, preview, tool_call_id, expires_at,
        operation_kind, operation_payload
      FROM approval_requests
    `);

    sqlite.exec(`DROP TABLE approval_requests`);
    sqlite.exec(`ALTER TABLE approval_requests_new RENAME TO approval_requests`);
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status)`);
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_approval_requests_run ON approval_requests(run_id)`);
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_approval_requests_tool_call ON approval_requests(tool_call_id)`);
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
