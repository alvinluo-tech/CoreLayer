type SqliteDatabase = import("better-sqlite3").Database;

/**
 * Add the delegation columns to an existing `agent_runs` table.
 *
 * A dispatched child run records who asked for it, what bounds it was granted,
 * and the objective it must satisfy. All three are additive and nullable: runs
 * created before this existed, and runs a user started, simply have no
 * delegation, which is the correct reading — there was no parent to narrow them.
 */
export function migrateAgentRunDelegation(sqlite: SqliteDatabase): void {
  const columns = sqlite.prepare(`PRAGMA table_info(agent_runs)`).all() as Array<{ name: string }>;
  if (columns.length === 0) return;
  const existing = new Set(columns.map((column) => column.name));

  if (!existing.has("delegation")) {
    sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN delegation TEXT`);
  }
  if (!existing.has("parent_run_id")) {
    sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN parent_run_id TEXT`);
  }
  if (!existing.has("objective")) {
    sqlite.exec(`ALTER TABLE agent_runs ADD COLUMN objective TEXT`);
  }
}
