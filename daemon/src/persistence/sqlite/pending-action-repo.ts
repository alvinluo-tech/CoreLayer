import { and, desc, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as defaultDb, schema } from "../client.js";
import type {
  CreatePendingActionInput,
  PendingActionRepository,
  PendingActionRow,
  PendingActionStatus,
} from "../repository/pending-action.js";

type DrizzleDb = BetterSQLite3Database<typeof schema>;

function mapRow(row: typeof schema.pendingActions.$inferSelect): PendingActionRow {
  return {
    id: row.id,
    approvalRequestId: row.approvalRequestId,
    runId: row.runId,
    executorRunId: row.executorRunId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    taskId: row.taskId,
    actionFingerprint: row.actionFingerprint,
    actionPayload: JSON.parse(row.actionPayload),
    resumePayload: JSON.parse(row.resumePayload),
    status: row.status as PendingActionStatus,
    error: row.error,
    result: row.result ? JSON.parse(row.result) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
  };
}

export function createSqlitePendingActionRepo(database?: DrizzleDb): PendingActionRepository {
  const db = database ?? defaultDb;
  return {
    async create(input: CreatePendingActionInput) {
      const id = crypto.randomUUID();
      db.insert(schema.pendingActions).values({
        id,
        approvalRequestId: input.approvalRequestId,
        runId: input.runId,
        executorRunId: input.executorRunId ?? null,
        workspaceId: input.workspaceId ?? null,
        projectId: input.projectId ?? null,
        taskId: input.taskId ?? null,
        actionFingerprint: input.actionFingerprint,
        actionPayload: JSON.stringify(input.actionPayload),
        resumePayload: JSON.stringify(input.resumePayload),
      }).run();
      return mapRow(db.select().from(schema.pendingActions).where(eq(schema.pendingActions.id, id)).get()!);
    },
    async getById(id) {
      const row = db.select().from(schema.pendingActions).where(eq(schema.pendingActions.id, id)).get();
      return row ? mapRow(row) : null;
    },
    async getByFingerprint(fingerprint) {
      const row = db.select().from(schema.pendingActions)
        .where(eq(schema.pendingActions.actionFingerprint, fingerprint))
        .orderBy(desc(schema.pendingActions.createdAt)).get();
      return row ? mapRow(row) : null;
    },
    async getByApprovalRequest(approvalRequestId) {
      const row = db.select().from(schema.pendingActions)
        .where(eq(schema.pendingActions.approvalRequestId, approvalRequestId))
        .orderBy(desc(schema.pendingActions.createdAt)).get();
      return row ? mapRow(row) : null;
    },
    async getOpenByWorkspace(workspaceId) {
      const terminal: PendingActionStatus[] = ["completed", "failed", "cancelled", "expired"];
      return db.select().from(schema.pendingActions)
        .where(and(
          eq(schema.pendingActions.workspaceId, workspaceId),
          inArray(schema.pendingActions.status, ["blocked", "approved", "resuming", "executing"]),
        ))
        .all()
        .filter((row) => !terminal.includes(row.status as PendingActionStatus))
        .map(mapRow);
    },
    async transition(id, from, to, error, resultValue) {
      const now = new Date().toISOString();
      const terminal = new Set<PendingActionStatus>(["completed", "failed", "cancelled", "expired"]);
      const result = db.update(schema.pendingActions).set({
        status: to,
        error: error ?? null,
        ...(resultValue !== undefined ? { result: JSON.stringify(resultValue) } : {}),
        updatedAt: now,
        completedAt: terminal.has(to) ? now : null,
      }).where(and(eq(schema.pendingActions.id, id), inArray(schema.pendingActions.status, from))).run();
      if (result.changes !== 1) return null;
      const row = db.select().from(schema.pendingActions).where(eq(schema.pendingActions.id, id)).get();
      return row ? mapRow(row) : null;
    },
    async deleteAll() {
      db.delete(schema.pendingActions).run();
    },
  };
}
