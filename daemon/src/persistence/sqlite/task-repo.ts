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
    dependencies: row.dependencies ? JSON.parse(row.dependencies) : [],
    blockedBy: row.blockedBy ? JSON.parse(row.blockedBy) : [],
    acceptanceCriteria: row.acceptanceCriteria ? JSON.parse(row.acceptanceCriteria) : [],
    artifacts: row.artifacts ? JSON.parse(row.artifacts) : [],
    runHistory: row.runHistory ? JSON.parse(row.runHistory) : [],
    manualInterventionRequired: row.manualInterventionRequired ?? false,
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
          objective: input.objective ?? null,
          assignedAgentId: input.assignedAgentId ?? null,
          parentTaskId: input.parentTaskId ?? null,
          dependencies: input.dependencies ? JSON.stringify(input.dependencies) : "[]",
          acceptanceCriteria: input.acceptanceCriteria ? JSON.stringify(input.acceptanceCriteria) : "[]",
          rollbackPlan: input.rollbackPlan ?? null,
          workspaceId: input.workspaceId ?? null,
          projectId: input.projectId ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const row = db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get()!;
      return normalizeTask(row);
    },

    async query(filters?: TaskFilters): Promise<TaskRow[]> {
      const conditions = [ne(schema.tasks.status, "deleted" as const)];
      if (filters?.status) conditions.push(eq(schema.tasks.status, filters.status as TaskRow["status"]));
      if (filters?.priority) conditions.push(eq(schema.tasks.priority, filters.priority));
      if (filters?.dueDateFrom) conditions.push(gte(schema.tasks.dueDate, filters.dueDateFrom));
      if (filters?.dueDateTo) conditions.push(lte(schema.tasks.dueDate, filters.dueDateTo));
      if (filters?.projectId) conditions.push(eq(schema.tasks.projectId, filters.projectId));
      if (filters?.workspaceId) conditions.push(eq(schema.tasks.workspaceId, filters.workspaceId));

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
        if (data.status === "done" || data.status === "completed") {
          updates.completedAt = new Date().toISOString();
        }
      }
      if (data.dueDate !== undefined) updates.dueDate = data.dueDate;
      if (data.tags !== undefined) updates.tags = JSON.stringify(data.tags);
      if (data.objective !== undefined) updates.objective = data.objective;
      if (data.assignedAgentId !== undefined) updates.assignedAgentId = data.assignedAgentId;
      if (data.parentTaskId !== undefined) updates.parentTaskId = data.parentTaskId;
      if (data.dependencies !== undefined) updates.dependencies = JSON.stringify(data.dependencies);
      if (data.blockedBy !== undefined) updates.blockedBy = JSON.stringify(data.blockedBy);
      if (data.acceptanceCriteria !== undefined) updates.acceptanceCriteria = JSON.stringify(data.acceptanceCriteria);
      if (data.artifacts !== undefined) updates.artifacts = JSON.stringify(data.artifacts);
      if (data.runHistory !== undefined) updates.runHistory = JSON.stringify(data.runHistory);
      if (data.manualInterventionRequired !== undefined) updates.manualInterventionRequired = data.manualInterventionRequired ? 1 : 0;
      if (data.rollbackPlan !== undefined) updates.rollbackPlan = data.rollbackPlan;
      if (data.workspaceId !== undefined) updates.workspaceId = data.workspaceId;
      if (data.projectId !== undefined) updates.projectId = data.projectId;

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

    async getByProjectId(projectId: string): Promise<TaskRow[]> {
      const rows = db
        .select()
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.projectId, projectId),
            ne(schema.tasks.status, "deleted" as const),
          ),
        )
        .all();
      return rows.map(normalizeTask);
    },

    async getByParentId(parentTaskId: string): Promise<TaskRow[]> {
      const rows = db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.parentTaskId, parentTaskId))
        .all();
      return rows.map(normalizeTask);
    },

    async getByWorkspaceId(workspaceId: string): Promise<TaskRow[]> {
      const rows = db
        .select()
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.workspaceId, workspaceId),
            ne(schema.tasks.status, "deleted" as const),
          ),
        )
        .all();
      return rows.map(normalizeTask);
    },

    async clear(): Promise<number> {
      const result = db.delete(schema.tasks).run();
      return result.changes;
    },
  };
}
