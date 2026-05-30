import { eq, and, gte, lte, ne } from "drizzle-orm";
import { db, schema } from "../client.js";
import type {
  TaskRepository,
  TaskRow,
  CreateTaskInput,
  TaskFilters,
  UpdateTaskData,
} from "../repository.js";

function normalizeTask(row: typeof schema.tasks.$inferSelect): TaskRow {
  return {
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : null,
  };
}

export function createSqliteTaskRepo(): TaskRepository {
  return {
    async create(input: CreateTaskInput): Promise<TaskRow> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.insert(schema.tasks)
        .values({
          id,
          userId: "local-user",
          title: input.title,
          description: input.description ?? null,
          priority: input.priority ?? 3,
          status: "pending",
          dueDate: input.dueDate ?? null,
          tags: input.tags ? JSON.stringify(input.tags) : null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const row = db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get()!;
      return normalizeTask(row);
    },

    async query(filters?: TaskFilters): Promise<TaskRow[]> {
      const conditions = [ne(schema.tasks.status, "deleted" as const)];
      if (filters?.status) conditions.push(eq(schema.tasks.status, filters.status as "pending" | "in_progress" | "done" | "deleted"));
      if (filters?.priority) conditions.push(eq(schema.tasks.priority, filters.priority));
      if (filters?.dueDateFrom) conditions.push(gte(schema.tasks.dueDate, filters.dueDateFrom));
      if (filters?.dueDateTo) conditions.push(lte(schema.tasks.dueDate, filters.dueDateTo));

      const rows = db.select().from(schema.tasks).where(and(...conditions)).all();
      return rows.map(normalizeTask);
    },

    async getById(id: string): Promise<TaskRow | null> {
      const row = db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get();
      return row ? normalizeTask(row) : null;
    },

    async update(id: string, data: UpdateTaskData): Promise<TaskRow> {
      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (data.title !== undefined) updates.title = data.title;
      if (data.priority !== undefined) updates.priority = data.priority;
      if (data.status !== undefined) {
        updates.status = data.status;
        if (data.status === "done") updates.completedAt = new Date().toISOString();
      }
      if (data.dueDate !== undefined) updates.dueDate = data.dueDate;
      if (data.tags !== undefined) updates.tags = JSON.stringify(data.tags);

      db.update(schema.tasks).set(updates).where(eq(schema.tasks.id, id)).run();
      const row = db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get()!;
      return normalizeTask(row);
    },

    async delete(id: string): Promise<boolean> {
      const result = db.update(schema.tasks)
        .set({ status: "deleted", updatedAt: new Date().toISOString() })
        .where(eq(schema.tasks.id, id))
        .run();
      return result.changes > 0;
    },

    async getTodayTasks(): Promise<TaskRow[]> {
      const today = new Date().toISOString().split("T")[0];
      const rows = db
        .select()
        .from(schema.tasks)
        .where(and(ne(schema.tasks.status, "deleted"), ne(schema.tasks.status, "done")))
        .all();
      const todayTasks = rows.filter(
        (t) => t.dueDate === today || (t.priority <= 2 && t.status !== "done"),
      );
      return todayTasks.map(normalizeTask);
    },

    async clear(): Promise<number> {
      const result = db.delete(schema.tasks).run();
      return result.changes;
    },
  };
}
