import type { Database } from "better-sqlite3";
import { migrations } from "./migrations.js";
import { migrateAgentRunsStatusConstraint } from "./sqlite/agent-runs-migration.js";
import { migrateApprovalRequestsStatusConstraint } from "./sqlite/approval-status-migration.js";
import { migrateMessageFts } from "./sqlite/message-fts-migration.js";

export function runDbMigrations(db: Database): void {
  // 1. Create tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at INTEGER
    );
  `);

  // 2. Legacy database upgrade safety detection
  const workspaceTableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces'"
  ).get();

  const migrationCount = db.prepare("SELECT count(*) as count FROM __drizzle_migrations").get() as { count: number };
  const isLegacyBootstrap = Boolean(workspaceTableExists && migrationCount.count === 0);

  // If it's a legacy db with tables, but no migration tracking records, mark all current ones as completed
  if (isLegacyBootstrap) {
    console.info("[Migrations] Legacy database detected. Bootstrapping migrations tracking table...");
    
    // Run legacy custom column additions and constraints rebuilds to ensure legacy tables
    // are 100% aligned with the genesis schema (0000_giant_genesis).
    runLegacyFTSAndConstraints(db);

    const insertStmt = db.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)");
    db.transaction(() => {
      const genesis = migrations[0];
      if (genesis) insertStmt.run(genesis.id, Date.now());
    })();
    console.info("[Migrations] Legacy genesis recorded; applying forward migrations normally.");
  }

  // 3. Normal migration execution flow
  const appliedMigrations = new Set(
    (db.prepare("SELECT hash FROM __drizzle_migrations").all() as { hash: string }[]).map(row => row.hash)
  );

  const insertMigration = db.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)");

  for (const m of migrations) {
    if (!appliedMigrations.has(m.id)) {
      console.info(`[Migrations] Applying migration: ${m.id}...`);
      try {
        db.transaction(() => {
          executeMigrationSql(db, m.sql, isLegacyBootstrap);
          insertMigration.run(m.id, Date.now());
        })();
        console.info(`[Migrations] Successfully applied: ${m.id}`);
      } catch (err) {
        console.error(`[Migrations] Failed to apply ${m.id}:`, err);
        throw err;
      }
    }
  }

  // Always ensure FTS indexes, triggers, and custom constraints are up to date after migrations run
  runLegacyFTSAndConstraints(db);
}

function executeMigrationSql(db: Database, sql: string, tolerateExistingColumns: boolean): void {
  if (!tolerateExistingColumns) {
    db.exec(sql);
    return;
  }

  for (const rawStatement of sql.split("--> statement-breakpoint")) {
    const statement = rawStatement.trim();
    if (!statement) continue;
    const addColumn = statement.match(/^ALTER TABLE [`"]?(\w+)[`"]? ADD [`"]?(\w+)[`"]?/i);
    if (addColumn) {
      const [, table, column] = addColumn;
      const columns = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
      if (columns.some((candidate) => candidate.name === column)) continue;
    }
    db.exec(statement);
  }
}

/**
 * Executes the custom SQLite constraint migrations and virtual FTS table setups.
 * These are non-Drizzle structures that must reside in the database at runtime.
 */
function runLegacyFTSAndConstraints(db: Database): void {
  // Ensure executor_runs has all expected columns (legacy database compatibility)
  try {
    const columns = db.prepare("PRAGMA table_info(executor_runs)").all() as { name: string }[];
    if (columns.length > 0) {
      const existingNames = new Set(columns.map((c) => c.name));
      if (!existingNames.has("domain")) {
        console.info("[Migrations] Adding missing 'domain' column to 'executor_runs' table...");
        db.exec("ALTER TABLE executor_runs ADD COLUMN domain TEXT NOT NULL DEFAULT 'coding'");
      }
      if (!existingNames.has("environment_kind")) {
        console.info("[Migrations] Adding missing 'environment_kind' column to 'executor_runs' table...");
        db.exec("ALTER TABLE executor_runs ADD COLUMN environment_kind TEXT NOT NULL DEFAULT 'local'");
      }
      if (!existingNames.has("environment_config")) {
        console.info("[Migrations] Adding missing 'environment_config' column to 'executor_runs' table...");
        db.exec("ALTER TABLE executor_runs ADD COLUMN environment_config TEXT DEFAULT '{}'");
      }
    }
  } catch (err) {
    console.error("[Migrations] Failed to check/add columns for executor_runs:", err);
  }

  // SQLite CHECK constraints rebuilds
  try {
    migrateAgentRunsStatusConstraint(db);
  } catch (err) {
    console.error("[Migrations] Failed to migrate agent_runs status constraint:", err);
  }

  try {
    migrateApprovalRequestsStatusConstraint(db);
  } catch (err) {
    console.error("[Migrations] Failed to migrate approval_requests status constraint:", err);
  }

  // Full-Text Search setups
  migrateMessageFts(db);

  try {
    db.exec(`
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
  } catch (err) {
    console.error("[Migrations] Failed to establish memories FTS index:", err);
  }
}
