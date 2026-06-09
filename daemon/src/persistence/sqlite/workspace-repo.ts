import { eq, and } from "drizzle-orm";
import { workspaces } from "../schema.js";
import { db } from "../client.js";
import type {
  WorkspaceRepository,
  WorkspaceRow,
  CreateWorkspaceInput,
  UpdateWorkspaceData,
} from "../repository.js";
import { randomUUID } from "crypto";

export function createSqliteWorkspaceRepo(): WorkspaceRepository {
  return {
    async create(input: CreateWorkspaceInput): Promise<WorkspaceRow> {
      const id = randomUUID();
      const now = new Date().toISOString();

      const row = {
        id,
        name: input.name ?? "Default Workspace",
        description: input.description ?? null,
        ownerId: input.ownerId,
        goal: input.goal ?? null,
        status: input.status ?? "draft" as const,
        activeProjectId: input.activeProjectId ?? null,
        completedAt: null,
        settings: input.settings ? JSON.stringify(input.settings) : null,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(workspaces).values(row);
      return {
        ...row,
        settings: input.settings ?? null,
      };
    },

    async getById(id: string): Promise<WorkspaceRow | null> {
      const rows = await db.select().from(workspaces).where(eq(workspaces.id, id));
      if (rows.length === 0) return null;
      return mapRow(rows[0]);
    },

    async getByOwnerId(ownerId: string): Promise<WorkspaceRow[]> {
      const rows = await db.select().from(workspaces).where(eq(workspaces.ownerId, ownerId));
      return rows.map(mapRow);
    },

    async getDefault(ownerId: string): Promise<WorkspaceRow | null> {
      const rows = await db
        .select()
        .from(workspaces)
        .where(and(eq(workspaces.ownerId, ownerId), eq(workspaces.name, "Default Workspace")))
        .limit(1);
      if (rows.length === 0) return null;
      return mapRow(rows[0]);
    },

    async update(id: string, data: UpdateWorkspaceData): Promise<WorkspaceRow> {
      const updateData: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };

      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.goal !== undefined) updateData.goal = data.goal;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.activeProjectId !== undefined) updateData.activeProjectId = data.activeProjectId;
      if (data.completedAt !== undefined) updateData.completedAt = data.completedAt;
      if (data.settings !== undefined) updateData.settings = JSON.stringify(data.settings);

      await db.update(workspaces).set(updateData).where(eq(workspaces.id, id));

      const updated = await this.getById(id);
      if (!updated) throw new Error(`Workspace ${id} not found`);
      return updated;
    },

    async delete(id: string): Promise<boolean> {
      const result = await db.delete(workspaces).where(eq(workspaces.id, id));
      return result.changes > 0;
    },
  };
}

function mapRow(row: typeof workspaces.$inferSelect): WorkspaceRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.ownerId,
    goal: row.goal ?? null,
    status: (row.status ?? "draft") as WorkspaceRow["status"],
    activeProjectId: row.activeProjectId ?? null,
    completedAt: row.completedAt ?? null,
    settings: row.settings ? JSON.parse(row.settings) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
