import { eq, and } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as defaultDb, schema } from "../client.js";
import type {
  AgentRunEventRepository,
  AgentRunEventRow,
  CreateAgentRunEventInput,
} from "../repository.js";

type DrizzleDb = BetterSQLite3Database<typeof schema>;

function mapRow(row: typeof schema.agentRunEvents.$inferSelect): AgentRunEventRow {
  return {
    id: row.id,
    runId: row.runId,
    sequence: row.sequence,
    type: row.type,
    payload: row.payload ? JSON.parse(row.payload) : null,
    createdAt: row.createdAt,
  };
}

export function createSqliteAgentRunEventRepo(database?: DrizzleDb): AgentRunEventRepository {
  const db = database ?? defaultDb;
  return {
    async create(input: CreateAgentRunEventInput): Promise<AgentRunEventRow> {
      const id = crypto.randomUUID();
      db.insert(schema.agentRunEvents)
        .values({
          id,
          runId: input.runId,
          sequence: input.sequence,
          type: input.type,
          payload: input.payload != null ? JSON.stringify(input.payload) : null,
        })
        .run();
      const row = db
        .select()
        .from(schema.agentRunEvents)
        .where(eq(schema.agentRunEvents.id, id))
        .get()!;
      return mapRow(row);
    },

    async getByRunId(runId: string): Promise<AgentRunEventRow[]> {
      const rows = db
        .select()
        .from(schema.agentRunEvents)
        .where(eq(schema.agentRunEvents.runId, runId))
        .orderBy(schema.agentRunEvents.sequence)
        .all();
      return rows.map(mapRow);
    },

    async getByType(runId: string, type: string): Promise<AgentRunEventRow[]> {
      const rows = db
        .select()
        .from(schema.agentRunEvents)
        .where(
          and(
            eq(schema.agentRunEvents.runId, runId),
            eq(schema.agentRunEvents.type, type),
          ),
        )
        .orderBy(schema.agentRunEvents.sequence)
        .all();
      return rows.map(mapRow);
    },
  };
}
