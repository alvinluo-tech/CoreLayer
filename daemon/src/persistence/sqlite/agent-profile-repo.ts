import { eq } from "drizzle-orm";
import { agentProfiles } from "../schema.js";
import { db } from "../client.js";
import type {
  AgentProfileRepository,
  AgentProfileRow,
  CreateAgentProfileInput,
  UpdateAgentProfileData,
} from "../repository.js";
import { randomUUID } from "crypto";

export function createSqliteAgentProfileRepo(): AgentProfileRepository {
  return {
    async create(input: CreateAgentProfileInput): Promise<AgentProfileRow> {
      const id = randomUUID();
      const now = new Date().toISOString();

      const row = {
        id,
        name: input.name,
        description: input.description ?? null,
        role: input.role ?? "general",
        capabilities: JSON.stringify(input.capabilities ?? []),
        enabled: input.enabled ?? true,
        modelPolicy: JSON.stringify(input.modelPolicy ?? {}),
        executorPolicy: input.executorPolicy != null ? JSON.stringify(input.executorPolicy) : null,
        skills: JSON.stringify(input.skills ?? []),
        tools: JSON.stringify(input.tools ?? []),
        knowledgeScopes: JSON.stringify(input.knowledgeScopes ?? []),
        permissions: JSON.stringify(input.permissions ?? []),
        memoryScopes: JSON.stringify(input.memoryScopes ?? []),
        isDefault: input.isDefault ?? false,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(agentProfiles).values(row);
      return mapRow(row);
    },

    async getById(id: string): Promise<AgentProfileRow | null> {
      const rows = await db.select().from(agentProfiles).where(eq(agentProfiles.id, id));
      if (rows.length === 0) return null;
      return mapRow(rows[0]);
    },

    async getAll(): Promise<AgentProfileRow[]> {
      const rows = await db.select().from(agentProfiles);
      return rows.map(mapRow);
    },

    async getDefault(): Promise<AgentProfileRow | null> {
      const rows = await db
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.isDefault, true))
        .limit(1);
      if (rows.length === 0) return null;
      return mapRow(rows[0]);
    },

    async update(id: string, data: UpdateAgentProfileData): Promise<AgentProfileRow> {
      const updateData: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };

      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.modelPolicy !== undefined) updateData.modelPolicy = JSON.stringify(data.modelPolicy);
      if (data.executorPolicy !== undefined) updateData.executorPolicy = data.executorPolicy != null ? JSON.stringify(data.executorPolicy) : null;
      if (data.skills !== undefined) updateData.skills = JSON.stringify(data.skills);
      if (data.tools !== undefined) updateData.tools = JSON.stringify(data.tools);
      if (data.knowledgeScopes !== undefined)
        updateData.knowledgeScopes = JSON.stringify(data.knowledgeScopes);
      if (data.permissions !== undefined) updateData.permissions = JSON.stringify(data.permissions);
      if (data.memoryScopes !== undefined)
        updateData.memoryScopes = JSON.stringify(data.memoryScopes);
      if (data.role !== undefined) updateData.role = data.role;
      if (data.capabilities !== undefined) updateData.capabilities = JSON.stringify(data.capabilities);
      if (data.enabled !== undefined) updateData.enabled = data.enabled;
      if (data.isDefault !== undefined) updateData.isDefault = data.isDefault;

      await db.update(agentProfiles).set(updateData).where(eq(agentProfiles.id, id));

      const updated = await this.getById(id);
      if (!updated) throw new Error(`AgentProfile ${id} not found`);
      return updated;
    },

    async delete(id: string): Promise<boolean> {
      const result = await db.delete(agentProfiles).where(eq(agentProfiles.id, id));
      return result.changes > 0;
    },
  };
}

function mapRow(row: typeof agentProfiles.$inferSelect): AgentProfileRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    role: row.role as AgentProfileRow["role"],
    capabilities: JSON.parse(row.capabilities),
    enabled: row.enabled,
    modelPolicy: JSON.parse(row.modelPolicy),
    executorPolicy: row.executorPolicy ? JSON.parse(row.executorPolicy) : null,
    skills: JSON.parse(row.skills),
    tools: JSON.parse(row.tools),
    knowledgeScopes: JSON.parse(row.knowledgeScopes),
    permissions: JSON.parse(row.permissions),
    memoryScopes: JSON.parse(row.memoryScopes),
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
