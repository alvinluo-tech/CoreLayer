import { getSupabaseClient } from "./client.js";
import type {
  TaskRepository,
  TaskRow,
  CreateTaskInput,
  TaskFilters,
  UpdateTaskData,
} from "../repository.js";

const TABLE = "tasks";

function toTaskRow(row: Record<string, unknown>): TaskRow {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    description: (row.description as string) ?? null,
    priority: (row.priority as number) ?? 3,
    status: row.status as TaskRow["status"],
    dueDate: (row.due_date as string) ?? null,
    tags: (row.tags as string[]) ?? null,
    completedAt: (row.completed_at as string) ?? null,
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export function createSupabaseTaskRepo(): TaskRepository {
  const client = getSupabaseClient();

  return {
    async create(input: CreateTaskInput): Promise<TaskRow> {
      const now = new Date().toISOString();
      const { data, error } = await client
        .from(TABLE)
        .insert({
          user_id: "local-user",
          title: input.title,
          description: input.description ?? null,
          priority: input.priority ?? 3,
          status: "pending",
          due_date: input.dueDate ?? null,
          tags: input.tags ?? null,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create task: ${error.message}`);
      return toTaskRow(data);
    },

    async query(filters?: TaskFilters): Promise<TaskRow[]> {
      let query = client.from(TABLE).select("*").neq("status", "deleted");

      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.priority) query = query.eq("priority", filters.priority);
      if (filters?.dueDateFrom) query = query.gte("due_date", filters.dueDateFrom);
      if (filters?.dueDateTo) query = query.lte("due_date", filters.dueDateTo);

      const { data, error } = await query;
      if (error) throw new Error(`Failed to query tasks: ${error.message}`);
      return (data ?? []).map(toTaskRow);
    },

    async getById(id: string): Promise<TaskRow | null> {
      const { data, error } = await client
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .single();

      if (error) return null;
      return toTaskRow(data);
    },

    async update(id: string, data: UpdateTaskData): Promise<TaskRow> {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (data.title !== undefined) updates.title = data.title;
      if (data.priority !== undefined) updates.priority = data.priority;
      if (data.status !== undefined) {
        updates.status = data.status;
        if (data.status === "done") updates.completed_at = new Date().toISOString();
      }
      if (data.dueDate !== undefined) updates.due_date = data.dueDate;
      if (data.tags !== undefined) updates.tags = data.tags;

      const { data: row, error } = await client
        .from(TABLE)
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update task: ${error.message}`);
      return toTaskRow(row);
    },

    async delete(id: string): Promise<boolean> {
      const { error } = await client
        .from(TABLE)
        .update({ status: "deleted", updated_at: new Date().toISOString() })
        .eq("id", id);

      return !error;
    },

    async getTodayTasks(): Promise<TaskRow[]> {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await client
        .from(TABLE)
        .select("*")
        .neq("status", "deleted")
        .neq("status", "done");

      if (error) throw new Error(`Failed to get today tasks: ${error.message}`);
      const rows = (data ?? []).map(toTaskRow);
      return rows.filter(
        (t) => t.dueDate === today || (t.priority <= 2 && t.status !== "done"),
      );
    },

    async clear(): Promise<number> {
      const { count, error } = await client
        .from(TABLE)
        .delete({ count: "exact" })
        .neq("id", "");
      if (error) throw new Error(`Failed to clear tasks: ${error.message}`);
      return count ?? 0;
    },
  };
}
