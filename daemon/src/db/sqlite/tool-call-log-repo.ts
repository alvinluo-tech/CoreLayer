import { eq, desc } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as defaultDb, schema } from "../client.js";
import type {
  ToolCallLogRepository,
  ToolCallLogRow,
  CreateToolCallLogInput,
} from "../repository.js";

type DrizzleDb = BetterSQLite3Database<typeof schema>;

function normalize(row: typeof schema.toolCallLogs.$inferSelect): ToolCallLogRow {
  return {
    ...row,
    args: row.args ? JSON.parse(row.args) : null,
    resultData: row.resultData ? JSON.parse(row.resultData) : null,
  };
}

export function createSqliteToolCallLogRepo(database?: DrizzleDb): ToolCallLogRepository {
  const db = database ?? defaultDb;
  return {
    async create(input: CreateToolCallLogInput): Promise<ToolCallLogRow> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.insert(schema.toolCallLogs)
        .values({
          id,
          toolId: input.toolId,
          toolName: input.toolName,
          appId: input.appId ?? null,
          source: input.source,
          args: input.args ? JSON.stringify(input.args) : null,
          resultSuccess: input.resultSuccess ?? null,
          resultData: input.resultData ? JSON.stringify(input.resultData) : null,
          resultError: input.resultError ?? null,
          risk: input.risk ?? null,
          confirmedByUser: input.confirmedByUser ?? null,
          durationMs: input.durationMs ?? null,
          conversationId: input.conversationId ?? null,
          createdAt: now,
        })
        .run();
      const row = db
        .select()
        .from(schema.toolCallLogs)
        .where(eq(schema.toolCallLogs.id, id))
        .get()!;
      return normalize(row);
    },

    async getByConversation(conversationId: string): Promise<ToolCallLogRow[]> {
      const rows = db
        .select()
        .from(schema.toolCallLogs)
        .where(eq(schema.toolCallLogs.conversationId, conversationId))
        .all();
      return rows.map(normalize);
    },

    async getByTool(toolId: string): Promise<ToolCallLogRow[]> {
      const rows = db
        .select()
        .from(schema.toolCallLogs)
        .where(eq(schema.toolCallLogs.toolId, toolId))
        .all();
      return rows.map(normalize);
    },

    async getRecent(limit = 50): Promise<ToolCallLogRow[]> {
      const rows = db
        .select()
        .from(schema.toolCallLogs)
        .orderBy(desc(schema.toolCallLogs.createdAt))
        .limit(limit)
        .all();
      return rows.map(normalize);
    },
  };
}
