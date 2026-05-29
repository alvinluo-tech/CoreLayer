import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as defaultDb, schema } from "../client.js";
import type {
  ModelProfileRepository,
  ModelProfileRow,
  UpsertModelProfileInput,
} from "../repository.js";

type DrizzleDb = BetterSQLite3Database<typeof schema>;

function normalize(row: typeof schema.modelProfiles.$inferSelect): ModelProfileRow {
  return {
    ...row,
    capabilities: row.capabilities ? JSON.parse(row.capabilities) : null,
    limits: row.limits ? JSON.parse(row.limits) : null,
    cost: row.cost ? JSON.parse(row.cost) : null,
  };
}

export function createSqliteModelProfileRepo(database?: DrizzleDb): ModelProfileRepository {
  const db = database ?? defaultDb;
  return {
    async getAll(): Promise<ModelProfileRow[]> {
      const rows = db.select().from(schema.modelProfiles).all();
      return rows.map(normalize);
    },

    async getDefault(): Promise<ModelProfileRow | null> {
      const row = db
        .select()
        .from(schema.modelProfiles)
        .where(eq(schema.modelProfiles.isDefault, true))
        .get();
      return row ? normalize(row) : null;
    },

    async upsert(input: UpsertModelProfileInput): Promise<ModelProfileRow> {
      const now = new Date().toISOString();
      const existing = db
        .select()
        .from(schema.modelProfiles)
        .where(eq(schema.modelProfiles.modelName, input.modelName))
        .get();

      if (existing) {
        const updates: Record<string, unknown> = { updatedAt: now };
        if (input.provider !== undefined) updates.provider = input.provider;
        if (input.displayName !== undefined) updates.displayName = input.displayName;
        if (input.capabilities !== undefined) updates.capabilities = JSON.stringify(input.capabilities);
        if (input.limits !== undefined) updates.limits = JSON.stringify(input.limits);
        if (input.cost !== undefined) updates.cost = JSON.stringify(input.cost);
        if (input.isDefault !== undefined) updates.isDefault = input.isDefault;

        db.update(schema.modelProfiles)
          .set(updates)
          .where(eq(schema.modelProfiles.id, existing.id))
          .run();
      } else {
        db.insert(schema.modelProfiles)
          .values({
            id: crypto.randomUUID(),
            provider: input.provider,
            modelName: input.modelName,
            displayName: input.displayName ?? null,
            capabilities: input.capabilities ? JSON.stringify(input.capabilities) : null,
            limits: input.limits ? JSON.stringify(input.limits) : null,
            cost: input.cost ? JSON.stringify(input.cost) : null,
            isDefault: input.isDefault ?? false,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      const row = db
        .select()
        .from(schema.modelProfiles)
        .where(eq(schema.modelProfiles.modelName, input.modelName))
        .get()!;
      return normalize(row);
    },

    async setDefault(id: string): Promise<void> {
      const now = new Date().toISOString();
      // Clear all defaults first
      db.update(schema.modelProfiles)
        .set({ isDefault: false, updatedAt: now })
        .run();
      // Set the target as default
      db.update(schema.modelProfiles)
        .set({ isDefault: true, updatedAt: now })
        .where(eq(schema.modelProfiles.id, id))
        .run();
    },

    async delete(id: string): Promise<boolean> {
      const result = db
        .delete(schema.modelProfiles)
        .where(eq(schema.modelProfiles.id, id))
        .run();
      return result.changes > 0;
    },
  };
}
