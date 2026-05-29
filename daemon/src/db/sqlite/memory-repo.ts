import { eq, and, like, or } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as defaultDb, schema } from "../client.js";
import type {
  MemoryRepository,
  MemoryRow,
  UpsertMemoryInput,
} from "../repository.js";

type DrizzleDb = BetterSQLite3Database<typeof schema>;

function normalize(row: typeof schema.memories.$inferSelect): MemoryRow {
  return { ...row };
}

export function createSqliteMemoryRepo(database?: DrizzleDb): MemoryRepository {
  const db = database ?? defaultDb;
  return {
    async getAll(userId = "default"): Promise<MemoryRow[]> {
      const rows = db
        .select()
        .from(schema.memories)
        .where(eq(schema.memories.userId, userId))
        .all();
      return rows.map(normalize);
    },

    async getByType(type: MemoryRow["type"], userId = "default"): Promise<MemoryRow[]> {
      const rows = db
        .select()
        .from(schema.memories)
        .where(and(eq(schema.memories.userId, userId), eq(schema.memories.type, type)))
        .all();
      return rows.map(normalize);
    },

    async getByKey(key: string, userId = "default"): Promise<MemoryRow | null> {
      const row = db
        .select()
        .from(schema.memories)
        .where(and(eq(schema.memories.userId, userId), eq(schema.memories.key, key)))
        .get();
      return row ? normalize(row) : null;
    },

    async search(query: string, userId = "default"): Promise<MemoryRow[]> {
      const pattern = `%${query}%`;
      const rows = db
        .select()
        .from(schema.memories)
        .where(
          and(
            eq(schema.memories.userId, userId),
            or(
              like(schema.memories.key, pattern),
              like(schema.memories.value, pattern),
            ),
          ),
        )
        .all();
      return rows.map(normalize);
    },

    async upsert(input: UpsertMemoryInput): Promise<MemoryRow> {
      const now = new Date().toISOString();
      const userId = input.userId ?? "default";
      const existing = db
        .select()
        .from(schema.memories)
        .where(and(eq(schema.memories.userId, userId), eq(schema.memories.key, input.key)))
        .get();

      if (existing) {
        db.update(schema.memories)
          .set({
            value: input.value,
            type: input.type,
            source: input.source ?? existing.source,
            confidence: input.confidence ?? existing.confidence,
            expiresAt: input.expiresAt ?? existing.expiresAt,
            updatedAt: now,
          })
          .where(eq(schema.memories.id, existing.id))
          .run();
      } else {
        db.insert(schema.memories)
          .values({
            id: crypto.randomUUID(),
            userId,
            type: input.type,
            key: input.key,
            value: input.value,
            source: input.source ?? null,
            confidence: input.confidence ?? null,
            expiresAt: input.expiresAt ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      const row = db
        .select()
        .from(schema.memories)
        .where(and(eq(schema.memories.userId, userId), eq(schema.memories.key, input.key)))
        .get()!;
      return normalize(row);
    },

    async delete(id: string): Promise<boolean> {
      const result = db.delete(schema.memories).where(eq(schema.memories.id, id)).run();
      return result.changes > 0;
    },

    async cleanExpired(): Promise<number> {
      const now = new Date().toISOString();
      const all = db.select().from(schema.memories).all() as typeof schema.memories.$inferSelect[];
      const expired = all.filter((m: typeof schema.memories.$inferSelect) => m.expiresAt !== null && m.expiresAt < now);

      let deleted = 0;
      for (const mem of expired) {
        db.delete(schema.memories).where(eq(schema.memories.id, mem.id)).run();
        deleted++;
      }
      return deleted;
    },
  };
}
