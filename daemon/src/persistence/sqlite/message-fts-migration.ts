import type Database from "better-sqlite3";

type Logger = Pick<typeof console, "error" | "info">;

function isReadonlySqliteError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? (err as { code?: unknown }).code : undefined;
  if (code === "SQLITE_READONLY") return true;
  const message = "message" in err ? String((err as { message?: unknown }).message) : "";
  return message.toLowerCase().includes("readonly database");
}

export function migrateMessageFts(sqlite: Database.Database, logger: Logger = console): void {
  try {
    const row = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='messages_fts'").get() as
      | { sql: string }
      | undefined;
    if (row && !row.sql.includes("content='messages'")) {
      logger.info("[Migration] Re-creating messages_fts virtual table with correct content='messages' reference...");
      sqlite.exec("DROP TABLE IF EXISTS messages_fts");
      sqlite.exec("DROP TRIGGER IF EXISTS messages_ai");
      sqlite.exec("DROP TRIGGER IF EXISTS messages_ad");
      sqlite.exec("DROP TRIGGER IF EXISTS messages_au");
    }
  } catch (err) {
    if (!isReadonlySqliteError(err)) {
      logger.error("[Migration] Failed to check/fix messages_fts table schema:", err);
    }
  }

  try {
    sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        content, role, conversation_id, content='messages', content_rowid='rowid'
      );

      CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(rowid, content, role, conversation_id)
        VALUES (new.rowid, new.content, new.role, new.conversation_id);
      END;

      CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content, role, conversation_id)
        VALUES('delete', old.rowid, old.content, old.role, old.conversation_id);
      END;

      CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content, role, conversation_id)
        VALUES('delete', old.rowid, old.content, old.role, old.conversation_id);
        INSERT INTO messages_fts(rowid, content, role, conversation_id)
        VALUES (new.rowid, new.content, new.role, new.conversation_id);
      END;
    `);
  } catch (err) {
    if (!isReadonlySqliteError(err)) {
      logger.error("[Migration] Failed to create messages_fts table/triggers:", err);
    }
    return;
  }

  try {
    sqlite.exec(
      "INSERT OR IGNORE INTO messages_fts(rowid, content, role, conversation_id) SELECT rowid, content, role, conversation_id FROM messages",
    );
  } catch (err) {
    if (!isReadonlySqliteError(err)) {
      logger.error("[Migration] Failed to populate messages_fts index:", err);
    }
  }
}
