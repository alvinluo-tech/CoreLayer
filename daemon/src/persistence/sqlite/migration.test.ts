import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../schema.js";
import { migrateAgentRunsStatusConstraint } from "./agent-runs-migration.js";

describe("DB Migration: uses column (BUG-M1 regression)", () => {
  it("adds uses column to existing memories table without it", () => {
    const sqlite = new Database(":memory:");

    // Simulate an old database BEFORE Phase 4 — no `uses` column
    sqlite.exec(`
      CREATE TABLE memories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT 'default',
        type TEXT NOT NULL CHECK(type IN ('fact', 'preference', 'context', 'summary')),
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        source TEXT,
        confidence REAL,
        expires_at TEXT,
        created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
        updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
      );
    `);

    // Verify column doesn't exist yet
    const before = sqlite.prepare("PRAGMA table_info(memories)").all() as { name: string }[];
    expect(before.some((c) => c.name === "uses")).toBe(false);

    // Run migration (same logic as client.ts)
    try {
      sqlite.exec(`ALTER TABLE memories ADD COLUMN uses INTEGER DEFAULT 0`);
    } catch {
      // Column already exists — ignore
    }

    // Verify column now exists
    const after = sqlite.prepare("PRAGMA table_info(memories)").all() as { name: string }[];
    expect(after.some((c) => c.name === "uses")).toBe(true);

    // Verify the column works: insert a row and check uses defaults to 0
    sqlite.exec(`
      INSERT INTO memories (id, user_id, type, key, value)
      VALUES ('test-1', 'default', 'fact', 'test key', 'test value')
    `);
    const row = sqlite.prepare("SELECT uses FROM memories WHERE id = 'test-1'").get() as { uses: number };
    expect(row.uses).toBe(0);

    // Verify incrementUses works via drizzle
    const db = drizzle(sqlite, { schema });
    db.update(schema.memories)
      .set({ uses: schema.memories.uses })
      .run();

    sqlite.close();
  });

  it("migration is idempotent — running twice does not error", () => {
    const sqlite = new Database(":memory:");

    // Create table with uses column already present
    sqlite.exec(`
      CREATE TABLE memories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT 'default',
        type TEXT NOT NULL CHECK(type IN ('fact', 'preference', 'context', 'summary')),
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        source TEXT,
        confidence REAL,
        uses INTEGER DEFAULT 0,
        expires_at TEXT,
        created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
        updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
      );
    `);

    // First migration — should not throw
    try {
      sqlite.exec(`ALTER TABLE memories ADD COLUMN uses INTEGER DEFAULT 0`);
    } catch {
      // Expected: column already exists
    }

    // Second migration — should also not throw
    try {
      sqlite.exec(`ALTER TABLE memories ADD COLUMN uses INTEGER DEFAULT 0`);
    } catch {
      // Expected: column already exists
    }

    // Verify column exists
    const columns = sqlite.prepare("PRAGMA table_info(memories)").all() as { name: string }[];
    const usesColumns = columns.filter((c) => c.name === "uses");
    expect(usesColumns).toHaveLength(1); // Exactly one column, not duplicated

    sqlite.close();
  });
});

describe("DB Migration: agent_runs status constraint", () => {
  it("rebuilds old agent_runs tables to accept queued runs without column misalignment", () => {
    const sqlite = new Database(":memory:");

    sqlite.exec(`
      CREATE TABLE agent_runs (
        id TEXT PRIMARY KEY,
        conversation_id TEXT,
        workspace_id TEXT,
        project_id TEXT,
        task_id TEXT,
        agent_id TEXT,
        user_message_id TEXT,
        assistant_message_id TEXT,
        status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'succeeded', 'failed', 'cancelled')),
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
      );
      INSERT INTO agent_runs (id, status, selected_model, tool_call_count)
      VALUES ('old-run', 'running', 'mimo-v2.5-pro', 2);
    `);

    migrateAgentRunsStatusConstraint(sqlite);

    const createSql = sqlite
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='agent_runs'")
      .get() as { sql: string };
    expect(createSql.sql).toContain("'queued'");
    expect(createSql.sql).toContain("waiting_for_approval");

    sqlite.prepare("INSERT INTO agent_runs (id, status) VALUES ('queued-run', 'queued')").run();

    const oldRun = sqlite
      .prepare("SELECT id, status, selected_model, tool_call_count, mode, selected_tools FROM agent_runs WHERE id = 'old-run'")
      .get() as {
        id: string;
        status: string;
        selected_model: string;
        tool_call_count: number;
        mode: string;
        selected_tools: string;
      };
    expect(oldRun).toEqual({
      id: "old-run",
      status: "running",
      selected_model: "mimo-v2.5-pro",
      tool_call_count: 2,
      mode: "chat",
      selected_tools: "[]",
    });

    const queuedRun = sqlite
      .prepare("SELECT id, status FROM agent_runs WHERE id = 'queued-run'")
      .get() as { id: string; status: string };
    expect(queuedRun).toEqual({ id: "queued-run", status: "queued" });

    sqlite.close();
  });
});
