import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../schema.js";
import { createSqliteExecutionLogRepo } from "../execution-log-repo.js";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
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
  `);

  return drizzle(sqlite, { schema });
}

describe("ExecutionLogRepository", () => {
  let db: ReturnType<typeof createTestDb>;
  let repo: ReturnType<typeof createSqliteExecutionLogRepo>;

  beforeEach(() => {
    db = createTestDb();
    repo = createSqliteExecutionLogRepo(db);
  });

  it("should append a log entry", async () => {
    const row = await repo.append({
      runId: "run-1",
      stream: "stdout",
      content: "Hello world",
    });

    expect(row.id).toBeDefined();
    expect(row.runId).toBe("run-1");
    expect(row.stream).toBe("stdout");
    expect(row.sequence).toBe(1);
    expect(row.content).toBe("Hello world");
  });

  it("should auto-increment sequence", async () => {
    await repo.append({ runId: "run-1", stream: "stdout", content: "line 1" });
    await repo.append({ runId: "run-1", stream: "stdout", content: "line 2" });
    const row3 = await repo.append({ runId: "run-1", stream: "stderr", content: "error" });

    expect(row3.sequence).toBe(3);
  });

  it("should get logs by run ID ordered by sequence", async () => {
    await repo.append({ runId: "run-1", stream: "stdout", content: "first" });
    await repo.append({ runId: "run-1", stream: "stderr", content: "error" });
    await repo.append({ runId: "run-1", stream: "stdout", content: "third" });

    const logs = await repo.getByRunId("run-1");
    expect(logs).toHaveLength(3);
    expect(logs[0].content).toBe("first");
    expect(logs[1].content).toBe("error");
    expect(logs[2].content).toBe("third");
  });

  it("should get tail logs", async () => {
    for (let i = 1; i <= 10; i++) {
      await repo.append({ runId: "run-1", stream: "stdout", content: `line ${i}` });
    }

    const tail = await repo.getTail("run-1", 3);
    expect(tail).toHaveLength(3);
    expect(tail[0].content).toBe("line 8");
    expect(tail[2].content).toBe("line 10");
  });

  it("should delete logs by run ID", async () => {
    await repo.append({ runId: "run-1", stream: "stdout", content: "to delete" });
    await repo.append({ runId: "run-2", stream: "stdout", content: "keep" });

    const deleted = await repo.deleteByRunId("run-1");
    expect(deleted).toBe(1);

    const remaining = await repo.getByRunId("run-1");
    expect(remaining).toHaveLength(0);

    const kept = await repo.getByRunId("run-2");
    expect(kept).toHaveLength(1);
  });

  it("should store metadata", async () => {
    const row = await repo.append({
      runId: "run-1",
      stream: "system",
      content: "executor started",
      metadata: { adapterId: "claude-code", pid: 1234 },
    });

    expect(row.metadata).toEqual({ adapterId: "claude-code", pid: 1234 });
  });

  it("should handle different stream types", async () => {
    await repo.append({ runId: "run-1", stream: "stdout", content: "out" });
    await repo.append({ runId: "run-1", stream: "stderr", content: "err" });
    await repo.append({ runId: "run-1", stream: "system", content: "sys" });
    await repo.append({ runId: "run-1", stream: "executor", content: "exec" });

    const logs = await repo.getByRunId("run-1");
    expect(logs.map((l) => l.stream)).toEqual(["stdout", "stderr", "system", "executor"]);
  });
});
