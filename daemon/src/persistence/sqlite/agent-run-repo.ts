import { eq, desc } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as defaultDb, schema } from "../client.js";
import type {
  AgentRunRepository,
  AgentRunRow,
  CreateAgentRunInput,
} from "../repository.js";

type DrizzleDb = BetterSQLite3Database<typeof schema>;

function mapRow(row: typeof schema.agentRuns.$inferSelect): AgentRunRow {
  return {
    id: row.id,
    conversationId: row.conversationId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    taskId: row.taskId,
    agentId: row.agentId,
    userMessageId: row.userMessageId,
    assistantMessageId: row.assistantMessageId,
    status: row.status as AgentRunRow["status"],
    mode: row.mode as AgentRunRow["mode"],
    selectedModel: row.selectedModel,
    routeReason: row.routeReason,
    selectedTools: row.selectedTools ? JSON.parse(row.selectedTools) : null,
    memoryReads: row.memoryReads ? JSON.parse(row.memoryReads) : null,
    memoryWrites: row.memoryWrites ? JSON.parse(row.memoryWrites) : null,
    toolCalls: row.toolCalls ? JSON.parse(row.toolCalls) : null,
    toolCallCount: row.toolCallCount,
    artifacts: row.artifacts ? JSON.parse(row.artifacts) : null,
    approvals: row.approvals ? JSON.parse(row.approvals) : null,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    durationMs: row.durationMs,
    error: row.error,
  };
}

export function createSqliteAgentRunRepo(database?: DrizzleDb): AgentRunRepository {
  const db = database ?? defaultDb;
  return {
    async create(input: CreateAgentRunInput): Promise<AgentRunRow> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.insert(schema.agentRuns)
        .values({
          id,
          conversationId: input.conversationId ?? null,
          workspaceId: input.workspaceId ?? null,
          projectId: input.projectId ?? null,
          taskId: input.taskId ?? null,
          agentId: input.agentId ?? null,
          userMessageId: input.userMessageId ?? null,
          assistantMessageId: input.assistantMessageId ?? null,
          mode: input.mode ?? "chat",
          selectedModel: input.selectedModel ?? null,
          routeReason: input.routeReason ?? null,
          selectedTools: input.selectedTools ? JSON.stringify(input.selectedTools) : "[]",
          startedAt: now,
        })
        .run();
      const row = db
        .select()
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.id, id))
        .get()!;
      return mapRow(row);
    },

    async getById(id: string): Promise<AgentRunRow | null> {
      const row = db
        .select()
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.id, id))
        .get();
      return row ? mapRow(row) : null;
    },

    async getByConversation(conversationId: string): Promise<AgentRunRow[]> {
      const rows = db
        .select()
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.conversationId, conversationId))
        .all();
      return rows.map(mapRow);
    },

    async getRecent(limit = 50): Promise<AgentRunRow[]> {
      const rows = db
        .select()
        .from(schema.agentRuns)
        .orderBy(desc(schema.agentRuns.startedAt))
        .limit(limit)
        .all();
      return rows.map(mapRow);
    },

    async updateStatus(
      id: string,
      status: AgentRunRow["status"],
      error?: string,
    ): Promise<void> {
      const now = new Date().toISOString();
      const existing = db
        .select()
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.id, id))
        .get();
      const durationMs = existing
        ? Date.now() - new Date(existing.startedAt).getTime()
        : null;
      db.update(schema.agentRuns)
        .set({
          status,
          completedAt: now,
          durationMs,
          error: error ?? null,
        })
        .where(eq(schema.agentRuns.id, id))
        .run();
    },

    async updateArtifacts(id: string, artifacts: unknown[]): Promise<void> {
      db.update(schema.agentRuns)
        .set({ artifacts: JSON.stringify(artifacts) })
        .where(eq(schema.agentRuns.id, id))
        .run();
    },
  };
}
