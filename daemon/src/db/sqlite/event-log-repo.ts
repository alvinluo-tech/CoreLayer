import { eq, desc, and, gte, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as defaultDb, schema } from "../client.js";
import type {
  EventLogRepository,
  EventLogRow,
  CreateEventLogInput,
  EventLogFilters,
} from "../repository.js";

type DrizzleDb = BetterSQLite3Database<typeof schema>;

function normalize(row: typeof schema.eventLog.$inferSelect): EventLogRow {
  return {
    ...row,
    payload: row.payload ? JSON.parse(row.payload) : null,
  };
}

export function createSqliteEventLogRepo(database?: DrizzleDb): EventLogRepository {
  const db = database ?? defaultDb;
  return {
    async create(input: CreateEventLogInput): Promise<EventLogRow> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.insert(schema.eventLog)
        .values({
          id,
          type: input.type,
          projectId: input.projectId ?? null,
          taskId: input.taskId ?? null,
          agentRunId: input.agentRunId ?? null,
          runtimeId: input.runtimeId ?? null,
          payload: input.payload ? JSON.stringify(input.payload) : null,
          createdAt: now,
        })
        .run();
      const row = db
        .select()
        .from(schema.eventLog)
        .where(eq(schema.eventLog.id, id))
        .get()!;
      return normalize(row);
    },

    async query(filters?: EventLogFilters): Promise<EventLogRow[]> {
      const conditions = [];
      if (filters?.type) conditions.push(eq(schema.eventLog.type, filters.type));
      if (filters?.projectId) conditions.push(eq(schema.eventLog.projectId, filters.projectId));
      if (filters?.agentRunId) conditions.push(eq(schema.eventLog.agentRunId, filters.agentRunId));
      if (filters?.runtimeId) conditions.push(eq(schema.eventLog.runtimeId, filters.runtimeId));
      if (filters?.since) conditions.push(gte(schema.eventLog.createdAt, filters.since));

      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const limit = filters?.limit ?? 50;
      const offset = filters?.offset ?? 0;

      const rows = db
        .select()
        .from(schema.eventLog)
        .where(where)
        .orderBy(desc(schema.eventLog.createdAt))
        .limit(limit)
        .offset(offset)
        .all();
      return rows.map(normalize);
    },

    async count(filters?: EventLogFilters): Promise<number> {
      const conditions = [];
      if (filters?.type) conditions.push(eq(schema.eventLog.type, filters.type));
      if (filters?.projectId) conditions.push(eq(schema.eventLog.projectId, filters.projectId));
      if (filters?.agentRunId) conditions.push(eq(schema.eventLog.agentRunId, filters.agentRunId));
      if (filters?.runtimeId) conditions.push(eq(schema.eventLog.runtimeId, filters.runtimeId));
      if (filters?.since) conditions.push(gte(schema.eventLog.createdAt, filters.since));

      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const result = db
        .select({ count: sql<number>`count(*)` })
        .from(schema.eventLog)
        .where(where)
        .get()!;
      return result.count;
    },
  };
}
