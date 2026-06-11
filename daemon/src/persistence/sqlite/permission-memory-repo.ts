import { eq, and, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as defaultDb, schema } from "../client.js";
import type {
  PermissionMemoryRepository,
  PermissionMemoryRow,
  CreatePermissionMemoryInput,
} from "../repository.js";

type DrizzleDb = BetterSQLite3Database<typeof schema>;

function mapRow(row: typeof schema.permissionMemories.$inferSelect): PermissionMemoryRow {
  return {
    id: row.id,
    userId: row.userId,
    projectId: row.projectId,
    runId: row.runId,
    toolId: row.toolId,
    risk: row.risk,
    decision: row.decision as PermissionMemoryRow["decision"],
    scope: row.scope as PermissionMemoryRow["scope"],
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

/** Default TTL for session-scoped permission memories: 30 minutes */
const SESSION_TTL_MS = 30 * 60 * 1000;

export function createSqlitePermissionMemoryRepo(
  database?: DrizzleDb,
): PermissionMemoryRepository {
  const db = database ?? defaultDb;
  return {
    async create(input: CreatePermissionMemoryInput): Promise<PermissionMemoryRow> {
      const id = crypto.randomUUID();
      const now = Date.now();

      // Session-scoped memories get a default TTL if none specified
      const expiresAt = input.expiresAt ?? (input.scope === "session" ? now + SESSION_TTL_MS : null);

      db.insert(schema.permissionMemories)
        .values({
          id,
          userId: input.userId ?? "default",
          projectId: input.projectId ?? null,
          runId: input.runId ?? null,
          toolId: input.toolId,
          risk: input.risk,
          decision: input.decision,
          scope: input.scope ?? "global",
          createdAt: now,
          expiresAt,
        })
        .run();
      const row = db
        .select()
        .from(schema.permissionMemories)
        .where(eq(schema.permissionMemories.id, id))
        .get()!;
      return mapRow(row);
    },

    async find(
      toolId: string,
      userId = "default",
      projectId?: string,
      runId?: string,
    ): Promise<PermissionMemoryRow | null> {
      const now = Date.now();

      // Priority: session > project > global

      // 1. Try session-scoped (tied to a specific AgentRun)
      if (runId) {
        const sessionRow = db
          .select()
          .from(schema.permissionMemories)
          .where(
            and(
              eq(schema.permissionMemories.toolId, toolId),
              eq(schema.permissionMemories.scope, "session"),
              eq(schema.permissionMemories.userId, userId),
              eq(schema.permissionMemories.runId, runId),
            ),
          )
          .get();
        if (sessionRow && (!sessionRow.expiresAt || sessionRow.expiresAt > now)) {
          return mapRow(sessionRow);
        }
      }

      // 2. Try project-scoped
      if (projectId) {
        const projectRow = db
          .select()
          .from(schema.permissionMemories)
          .where(
            and(
              eq(schema.permissionMemories.toolId, toolId),
              eq(schema.permissionMemories.projectId, projectId),
              eq(schema.permissionMemories.userId, userId),
            ),
          )
          .get();
        if (projectRow && (!projectRow.expiresAt || projectRow.expiresAt > now)) {
          return mapRow(projectRow);
        }
      }

      // 3. Fall back to global
      const globalRow = db
        .select()
        .from(schema.permissionMemories)
        .where(
          and(
            eq(schema.permissionMemories.toolId, toolId),
            eq(schema.permissionMemories.scope, "global"),
            eq(schema.permissionMemories.userId, userId),
          ),
        )
        .get();
      if (globalRow && (!globalRow.expiresAt || globalRow.expiresAt > now)) {
        return mapRow(globalRow);
      }

      return null;
    },

    async getByUserId(userId: string): Promise<PermissionMemoryRow[]> {
      const rows = db
        .select()
        .from(schema.permissionMemories)
        .where(eq(schema.permissionMemories.userId, userId))
        .all();
      return rows.map(mapRow);
    },

    async getByProjectId(projectId: string): Promise<PermissionMemoryRow[]> {
      const rows = db
        .select()
        .from(schema.permissionMemories)
        .where(eq(schema.permissionMemories.projectId, projectId))
        .all();
      return rows.map(mapRow);
    },

    async delete(id: string): Promise<boolean> {
      const result = db
        .delete(schema.permissionMemories)
        .where(eq(schema.permissionMemories.id, id))
        .run();
      return result.changes > 0;
    },

    async cleanupExpired(): Promise<number> {
      const now = Date.now();
      const result = db
        .delete(schema.permissionMemories)
        .where(sql`expires_at IS NOT NULL AND expires_at < ${now}`)
        .run();
      return result.changes;
    },
  };
}
