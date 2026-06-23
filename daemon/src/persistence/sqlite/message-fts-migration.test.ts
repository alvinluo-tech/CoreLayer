import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { migrateMessageFts } from "./message-fts-migration.js";

function createMessageTables(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      title TEXT NOT NULL DEFAULT 'New Chat'
    );

    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT ''
    );
  `);
}

describe("migrateMessageFts", () => {
  it("does not log an error when readonly databases cannot backfill messages_fts", () => {
    const dir = mkdtempSync(join(tmpdir(), "jarvis-fts-"));
    const dbPath = join(dir, "test.db");
    const writable = new Database(dbPath);
    try {
      createMessageTables(writable);
      migrateMessageFts(writable);
      writable
        .prepare("INSERT INTO conversations (id, title) VALUES (?, ?)")
        .run("conv-1", "Readonly FTS");
      writable
        .prepare("INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)")
        .run("msg-1", "conv-1", "user", "hello");
    } finally {
      writable.close();
    }

    const readonly = new Database(dbPath, { readonly: true });
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
    };
    try {
      migrateMessageFts(readonly, logger);
      expect(logger.error).not.toHaveBeenCalled();
    } finally {
      readonly.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
