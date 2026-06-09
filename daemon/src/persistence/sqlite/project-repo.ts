import { eq, and } from "drizzle-orm";
import { projects } from "../schema.js";
import { db } from "../client.js";
import type {
  ProjectRepository,
  ProjectRow,
  CreateProjectInput,
  UpdateProjectData,
} from "../repository.js";
import { randomUUID } from "crypto";

export function createSqliteProjectRepo(): ProjectRepository {
  return {
    async create(input: CreateProjectInput): Promise<ProjectRow> {
      const id = randomUUID();
      const now = new Date().toISOString();

      const row = {
        id,
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description ?? null,
        spec: input.spec ?? null,
        techStack: input.techStack ?? null,
        rootPath: input.rootPath ?? null,
        status: input.status ?? "active",
        settings: input.settings ? JSON.stringify(input.settings) : null,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(projects).values(row);
      return {
        ...row,
        status: row.status as ProjectRow["status"],
        settings: input.settings ?? null,
      };
    },

    async getById(id: string): Promise<ProjectRow | null> {
      const rows = await db.select().from(projects).where(eq(projects.id, id));
      if (rows.length === 0) return null;
      return mapRow(rows[0]);
    },

    async getByWorkspaceId(workspaceId: string): Promise<ProjectRow[]> {
      const rows = await db.select().from(projects).where(eq(projects.workspaceId, workspaceId));
      return rows.map(mapRow);
    },

    async getActiveByWorkspaceId(workspaceId: string): Promise<ProjectRow[]> {
      const rows = await db
        .select()
        .from(projects)
        .where(and(eq(projects.workspaceId, workspaceId), eq(projects.status, "active")));
      return rows.map(mapRow);
    },

    async update(id: string, data: UpdateProjectData): Promise<ProjectRow> {
      const updateData: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };

      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.spec !== undefined) updateData.spec = data.spec;
      if (data.techStack !== undefined) updateData.techStack = data.techStack;
      if (data.rootPath !== undefined) updateData.rootPath = data.rootPath;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.settings !== undefined) updateData.settings = JSON.stringify(data.settings);

      await db.update(projects).set(updateData).where(eq(projects.id, id));

      const updated = await this.getById(id);
      if (!updated) throw new Error(`Project ${id} not found`);
      return updated;
    },

    async delete(id: string): Promise<boolean> {
      const result = await db.delete(projects).where(eq(projects.id, id));
      return result.changes > 0;
    },
  };
}

function mapRow(row: typeof projects.$inferSelect): ProjectRow {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description,
    spec: row.spec ?? null,
    techStack: row.techStack ?? null,
    rootPath: row.rootPath ?? null,
    status: row.status as ProjectRow["status"],
    settings: row.settings ? JSON.parse(row.settings) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
