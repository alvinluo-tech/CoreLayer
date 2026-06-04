import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as defaultDb, schema } from "../client.js";
import type {
  GoalRepository,
  GoalRow,
  CreateGoalInput,
  UpdateGoalData,
} from "../repository.js";

type DrizzleDb = BetterSQLite3Database<typeof schema>;

function normalize(row: typeof schema.goals.$inferSelect): GoalRow {
  return {
    ...row,
    progress: row.progress ? JSON.parse(row.progress) : null,
  };
}

export function createSqliteGoalRepo(database?: DrizzleDb): GoalRepository {
  const db = database ?? defaultDb;
  return {
    async create(input: CreateGoalInput): Promise<GoalRow> {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      db.insert(schema.goals)
        .values({
          id,
          userId: "default",
          description: input.description,
          status: input.status ?? "active",
          progress: input.progress ? JSON.stringify(input.progress) : null,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const row = db.select().from(schema.goals).where(eq(schema.goals.id, id)).get()!;
      return normalize(row);
    },

    async getById(id: string): Promise<GoalRow | null> {
      const row = db.select().from(schema.goals).where(eq(schema.goals.id, id)).get();
      return row ? normalize(row) : null;
    },

    async list(userId = "default"): Promise<GoalRow[]> {
      const rows = db.select().from(schema.goals).where(eq(schema.goals.userId, userId)).all();
      return rows.map(normalize);
    },

    async getActive(userId = "default"): Promise<GoalRow[]> {
      const rows = db
        .select()
        .from(schema.goals)
        .where(eq(schema.goals.userId, userId))
        .all()
        .filter((r) => r.status === "active");
      return rows.map(normalize);
    },

    async update(id: string, data: UpdateGoalData): Promise<GoalRow> {
      const now = new Date().toISOString();
      const existing = db.select().from(schema.goals).where(eq(schema.goals.id, id)).get();
      if (!existing) throw new Error(`Goal not found: ${id}`);

      db.update(schema.goals)
        .set({
          ...(data.description !== undefined && { description: data.description }),
          ...(data.status !== undefined && { status: data.status }),
          ...(data.progress !== undefined && { progress: JSON.stringify(data.progress) }),
          updatedAt: now,
        })
        .where(eq(schema.goals.id, id))
        .run();

      const row = db.select().from(schema.goals).where(eq(schema.goals.id, id)).get()!;
      return normalize(row);
    },

    async delete(id: string): Promise<boolean> {
      const result = db.delete(schema.goals).where(eq(schema.goals.id, id)).run();
      return result.changes > 0;
    },
  };
}
