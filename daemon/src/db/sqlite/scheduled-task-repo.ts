import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as defaultDb, schema } from "../client.js";
import type {
  ScheduledTaskRepository,
  ScheduledTaskRow,
  CreateScheduledTaskInput,
  UpdateScheduledTaskData,
} from "../repository.js";

type DrizzleDb = BetterSQLite3Database<typeof schema>;

function normalize(row: typeof schema.scheduledTasks.$inferSelect): ScheduledTaskRow {
  return {
    ...row,
    input: row.input ? JSON.parse(row.input) : null,
    lastResult: row.lastResult ? JSON.parse(row.lastResult) : null,
  };
}

export function createSqliteScheduledTaskRepo(database?: DrizzleDb): ScheduledTaskRepository {
  const db = database ?? defaultDb;
  return {
    async getAll(): Promise<ScheduledTaskRow[]> {
      const rows = db.select().from(schema.scheduledTasks).all();
      return rows.map(normalize);
    },

    async getById(id: string): Promise<ScheduledTaskRow | null> {
      const row = db.select().from(schema.scheduledTasks).where(eq(schema.scheduledTasks.id, id)).get();
      return row ? normalize(row) : null;
    },

    async upsert(input: CreateScheduledTaskInput): Promise<ScheduledTaskRow> {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      db.insert(schema.scheduledTasks)
        .values({
          id,
          name: input.name,
          cronExpr: input.cronExpr,
          prompt: input.prompt ?? null,
          skillName: input.skillName ?? null,
          input: input.input ? JSON.stringify(input.input) : null,
          enabled: input.enabled ?? true,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const row = db.select().from(schema.scheduledTasks).where(eq(schema.scheduledTasks.id, id)).get()!;
      return normalize(row);
    },

    async update(id: string, data: UpdateScheduledTaskData): Promise<ScheduledTaskRow> {
      const now = new Date().toISOString();
      const existing = db.select().from(schema.scheduledTasks).where(eq(schema.scheduledTasks.id, id)).get();
      if (!existing) throw new Error(`Scheduled task not found: ${id}`);

      db.update(schema.scheduledTasks)
        .set({
          ...(data.name !== undefined && { name: data.name }),
          ...(data.cronExpr !== undefined && { cronExpr: data.cronExpr }),
          ...(data.prompt !== undefined && { prompt: data.prompt }),
          ...(data.skillName !== undefined && { skillName: data.skillName }),
          ...(data.input !== undefined && { input: JSON.stringify(data.input) }),
          ...(data.enabled !== undefined && { enabled: data.enabled }),
          updatedAt: now,
        })
        .where(eq(schema.scheduledTasks.id, id))
        .run();

      const row = db.select().from(schema.scheduledTasks).where(eq(schema.scheduledTasks.id, id)).get()!;
      return normalize(row);
    },

    async delete(id: string): Promise<boolean> {
      const result = db.delete(schema.scheduledTasks).where(eq(schema.scheduledTasks.id, id)).run();
      return result.changes > 0;
    },

    async setEnabled(id: string, enabled: boolean): Promise<void> {
      const now = new Date().toISOString();
      const result = db.update(schema.scheduledTasks)
        .set({ enabled, updatedAt: now })
        .where(eq(schema.scheduledTasks.id, id))
        .run();
      if (result.changes === 0) throw new Error(`Scheduled task not found: ${id}`);
    },

    async updateLastRun(id: string, lastRun: string, nextRun: string, result?: unknown): Promise<void> {
      const now = new Date().toISOString();
      db.update(schema.scheduledTasks)
        .set({
          lastRun,
          nextRun,
          lastResult: result ? JSON.stringify(result) : null,
          updatedAt: now,
        })
        .where(eq(schema.scheduledTasks.id, id))
        .run();
    },
  };
}
