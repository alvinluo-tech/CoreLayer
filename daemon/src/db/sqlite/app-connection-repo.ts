import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as defaultDb, schema } from "../client.js";
import type {
  AppConnectionRepository,
  AppConnectionRow,
  UpsertAppConnectionInput,
} from "../repository.js";

type DrizzleDb = BetterSQLite3Database<typeof schema>;

function normalize(row: typeof schema.appConnections.$inferSelect): AppConnectionRow {
  return {
    ...row,
    config: row.config ? JSON.parse(row.config) : null,
  };
}

export function createSqliteAppConnectionRepo(database?: DrizzleDb): AppConnectionRepository {
  const db = database ?? defaultDb;
  return {
    async getAll(): Promise<AppConnectionRow[]> {
      const rows = db.select().from(schema.appConnections).all();
      return rows.map(normalize);
    },

    async getByAppId(appId: string): Promise<AppConnectionRow | null> {
      const row = db
        .select()
        .from(schema.appConnections)
        .where(eq(schema.appConnections.appId, appId))
        .get();
      return row ? normalize(row) : null;
    },

    async upsert(input: UpsertAppConnectionInput): Promise<AppConnectionRow> {
      const now = new Date().toISOString();
      const existing = db
        .select()
        .from(schema.appConnections)
        .where(eq(schema.appConnections.appId, input.appId))
        .get();

      if (existing) {
        const updates: Record<string, unknown> = { updatedAt: now };
        if (input.appName !== undefined) updates.appName = input.appName;
        if (input.source !== undefined) updates.source = input.source;
        if (input.config !== undefined) updates.config = JSON.stringify(input.config);
        if (input.status !== undefined) {
          updates.status = input.status;
          if (input.status === "connected") updates.lastConnected = now;
        }
        if (input.lastError !== undefined) updates.lastError = input.lastError;
        if (input.toolCount !== undefined) updates.toolCount = input.toolCount;

        db.update(schema.appConnections)
          .set(updates)
          .where(eq(schema.appConnections.appId, input.appId))
          .run();
      } else {
        db.insert(schema.appConnections)
          .values({
            id: crypto.randomUUID(),
            appId: input.appId,
            appName: input.appName,
            source: input.source,
            config: input.config ? JSON.stringify(input.config) : null,
            status: input.status ?? "disconnected",
            lastConnected: input.status === "connected" ? now : null,
            lastError: input.lastError ?? null,
            toolCount: input.toolCount ?? 0,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      const row = db
        .select()
        .from(schema.appConnections)
        .where(eq(schema.appConnections.appId, input.appId))
        .get()!;
      return normalize(row);
    },

    async delete(appId: string): Promise<boolean> {
      const result = db
        .delete(schema.appConnections)
        .where(eq(schema.appConnections.appId, appId))
        .run();
      return result.changes > 0;
    },
  };
}
