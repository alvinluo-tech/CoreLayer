type SqliteDatabase = import("better-sqlite3").Database;

/**
 * Add the approval action digest column to an existing database.
 *
 * The digest binds an approval to the exact tool call that will run:
 * `sha256(toolId + canonical args)`. Rows created before the column existed
 * keep `NULL`, and the executor treats NULL as "not verifiable" rather than as
 * a mismatch, so in-flight approvals survive the upgrade.
 *
 * Done here rather than through drizzle-kit because SQLite's `ALTER TABLE ADD
 * COLUMN` is idempotent to check and the generated migration bundle is a build
 * artifact this repo does not regenerate in feature branches.
 */
export function migrateApprovalActionDigest(sqlite: SqliteDatabase): void {
  const columns = sqlite.prepare(`PRAGMA table_info(approval_requests)`).all() as Array<{ name: string }>;
  if (columns.length === 0) return;
  if (columns.some((column) => column.name === "action_digest")) return;

  sqlite.exec(`ALTER TABLE approval_requests ADD COLUMN action_digest TEXT`);
}
