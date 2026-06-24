import { eq, desc, asc, max } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as defaultDb, schema } from "../client.js";
import type {
  ExecutionLogRepository,
  ExecutionLogRow,
  CreateExecutionLogInput,
} from "../repository/execution-log.js";

type DrizzleDb = BetterSQLite3Database<typeof schema>;

function mapRow(row: typeof schema.executionLogs.$inferSelect): ExecutionLogRow {
  return {
    id: row.id,
    runId: row.runId,
    executorRunId: row.executorRunId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    taskId: row.taskId,
    stream: row.stream as ExecutionLogRow["stream"],
    sequence: row.sequence,
    content: row.content,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    createdAt: row.createdAt,
  };
}

export function createSqliteExecutionLogRepo(database?: DrizzleDb): ExecutionLogRepository {
  const db = database ?? defaultDb;

  return {
    async append(input: CreateExecutionLogInput): Promise<ExecutionLogRow> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      // Get next sequence number
      const seqResult = db
        .select({ maxSeq: max(schema.executionLogs.sequence) })
        .from(schema.executionLogs)
        .where(eq(schema.executionLogs.runId, input.runId))
        .get();
      const sequence = (seqResult?.maxSeq ?? 0) + 1;

      db.insert(schema.executionLogs)
        .values({
          id,
          runId: input.runId,
          executorRunId: input.executorRunId ?? null,
          workspaceId: input.workspaceId ?? null,
          projectId: input.projectId ?? null,
          taskId: input.taskId ?? null,
          stream: input.stream,
          sequence,
          content: input.content,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
          createdAt: now,
        })
        .run();

      return {
        id,
        runId: input.runId,
        executorRunId: input.executorRunId ?? null,
        workspaceId: input.workspaceId ?? null,
        projectId: input.projectId ?? null,
        taskId: input.taskId ?? null,
        stream: input.stream,
        sequence,
        content: input.content,
        metadata: input.metadata ?? null,
        createdAt: now,
      };
    },

    async getByRunId(runId: string, limit = 500): Promise<ExecutionLogRow[]> {
      const rows = db
        .select()
        .from(schema.executionLogs)
        .where(eq(schema.executionLogs.runId, runId))
        .orderBy(asc(schema.executionLogs.sequence))
        .limit(limit)
        .all();
      return rows.map(mapRow);
    },

    async getTail(runId: string, limit: number): Promise<ExecutionLogRow[]> {
      const rows = db
        .select()
        .from(schema.executionLogs)
        .where(eq(schema.executionLogs.runId, runId))
        .orderBy(desc(schema.executionLogs.sequence))
        .limit(limit)
        .all();
      return rows.reverse().map(mapRow);
    },

    async deleteByRunId(runId: string): Promise<number> {
      const result = db
        .delete(schema.executionLogs)
        .where(eq(schema.executionLogs.runId, runId))
        .run();
      return result.changes;
    },
  };
}
