import { eq, and, inArray } from "drizzle-orm";
import { workspaces } from "../schema.js";
import { db } from "../client.js";
import * as schema from "../schema.js";
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
      return db.transaction((tx) => {
        // 1. Get projects of this workspace
        const workspaceProjects = tx
          .select({ id: schema.projects.id })
          .from(schema.projects)
          .where(eq(schema.projects.workspaceId, id))
          .all();
        const projectIds = workspaceProjects.map((p) => p.id);

        // 2. Get conversations of this workspace and its projects
        let workspaceConversations = tx
          .select({ id: schema.conversations.id })
          .from(schema.conversations)
          .where(eq(schema.conversations.workspaceId, id))
          .all();

        if (projectIds.length > 0) {
          const projectConversations = tx
            .select({ id: schema.conversations.id })
            .from(schema.conversations)
            .where(inArray(schema.conversations.projectId, projectIds))
            .all();
          workspaceConversations = [...workspaceConversations, ...projectConversations];
        }
        const conversationIds = Array.from(new Set(workspaceConversations.map((c) => c.id)));

        // 3. Get agent runs of this workspace and its projects
        let workspaceRuns = tx
          .select({ id: schema.agentRuns.id })
          .from(schema.agentRuns)
          .where(eq(schema.agentRuns.workspaceId, id))
          .all();

        if (projectIds.length > 0) {
          const projectRuns = tx
            .select({ id: schema.agentRuns.id })
            .from(schema.agentRuns)
            .where(inArray(schema.agentRuns.projectId, projectIds))
            .all();
          workspaceRuns = [...workspaceRuns, ...projectRuns];
        }
        const runIds = Array.from(new Set(workspaceRuns.map((r) => r.id)));

        // 4. Delete agent run events & approval requests
        if (runIds.length > 0) {
          tx.delete(schema.agentRunEvents)
            .where(inArray(schema.agentRunEvents.runId, runIds))
            .run();
          tx.delete(schema.approvalRequests)
            .where(inArray(schema.approvalRequests.runId, runIds))
            .run();
        }

        // 5. Delete agent runs
        tx.delete(schema.agentRuns).where(eq(schema.agentRuns.workspaceId, id)).run();
        if (projectIds.length > 0) {
          tx.delete(schema.agentRuns).where(inArray(schema.agentRuns.projectId, projectIds)).run();
        }

        // 6. Delete messages & conversations
        if (conversationIds.length > 0) {
          tx.delete(schema.messages)
            .where(inArray(schema.messages.conversationId, conversationIds))
            .run();
        }
        tx.delete(schema.conversations).where(eq(schema.conversations.workspaceId, id)).run();
        if (projectIds.length > 0) {
          tx.delete(schema.conversations).where(inArray(schema.conversations.projectId, projectIds)).run();
        }

        // 7. Delete tasks
        tx.delete(schema.tasks).where(eq(schema.tasks.workspaceId, id)).run();
        if (projectIds.length > 0) {
          tx.delete(schema.tasks).where(inArray(schema.tasks.projectId, projectIds)).run();
        }

        // 8. Delete permission memories
        if (projectIds.length > 0) {
          tx.delete(schema.permissionMemories)
            .where(inArray(schema.permissionMemories.projectId, projectIds))
            .run();
        }

        // 9. Delete artifacts before projects because artifacts.project_id references projects.id.
        tx.delete(schema.artifacts).where(eq(schema.artifacts.workspaceId, id)).run();

        // 10. Delete projects
        tx.delete(schema.projects).where(eq(schema.projects.workspaceId, id)).run();

        // 11. Delete workspace agents (profile links)
        tx.delete(schema.workspaceAgents).where(eq(schema.workspaceAgents.workspaceId, id)).run();

        // 12. Delete workspace itself
        const result = tx.delete(workspaces).where(eq(workspaces.id, id)).run();
        return result.changes > 0;
      });
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
