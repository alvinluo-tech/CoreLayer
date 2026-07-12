import { eq, desc, inArray, not } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as defaultDb, schema } from "../client.js";
import type {
  ExecutorRunRepository,
  ExecutorRunRow,
  CreateExecutorRunInput,
  UpdateExecutorRunInput,
  ExecutorRunStatus,
} from "../repository/executor-run.js";

type DrizzleDb = BetterSQLite3Database<typeof schema>;

const TERMINAL_STATUSES: ExecutorRunStatus[] = [
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
  "cleanup_failed",
];

function mapRow(row: typeof schema.executorRuns.$inferSelect): ExecutorRunRow {
  return {
    id: row.id,
    agentRunId: row.agentRunId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    taskId: row.taskId,
    agentId: row.agentId,
    adapterId: row.adapterId,
    attemptNumber: row.attemptNumber,
    nativeSessionId: row.nativeSessionId,
    nativeTurnId: row.nativeTurnId,
    eventCursor: row.eventCursor,
    heartbeatAt: row.heartbeatAt,
    leaseOwner: row.leaseOwner,
    leaseExpiresAt: row.leaseExpiresAt,
    domain: row.domain,
    status: row.status as ExecutorRunStatus,
    taskPrompt: row.taskPrompt,
    environmentKind: row.environmentKind,
    environmentConfig: row.environmentConfig ? JSON.parse(row.environmentConfig) : {},
    workingDirectory: row.workingDirectory,
    pid: row.pid,
    exitCode: row.exitCode,
    error: row.error,
    failureCategory: row.failureCategory,
    timeoutMs: row.timeoutMs,
    artifacts: row.artifacts ? JSON.parse(row.artifacts) : {},
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    durationMs: row.durationMs,
  };
}

export function createSqliteExecutorRunRepo(database?: DrizzleDb): ExecutorRunRepository {
  const db = database ?? defaultDb;

  return {
    async create(input: CreateExecutorRunInput): Promise<ExecutorRunRow> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.insert(schema.executorRuns)
        .values({
          id,
          agentRunId: input.agentRunId ?? null,
          workspaceId: input.workspaceId ?? null,
          projectId: input.projectId ?? null,
          taskId: input.taskId ?? null,
          agentId: input.agentId ?? null,
          adapterId: input.adapterId,
          attemptNumber: input.attemptNumber ?? 1,
          nativeSessionId: input.nativeSessionId ?? null,
          nativeTurnId: input.nativeTurnId ?? null,
          eventCursor: input.eventCursor ?? 0,
          heartbeatAt: input.heartbeatAt ?? null,
          leaseOwner: input.leaseOwner ?? null,
          leaseExpiresAt: input.leaseExpiresAt ?? null,
          domain: input.domain ?? "coding",
          status: "created",
          taskPrompt: input.taskPrompt,
          environmentKind: input.environmentKind ?? "local",
          environmentConfig: input.environmentConfig ? JSON.stringify(input.environmentConfig) : "{}",
          workingDirectory: input.workingDirectory ?? null,
          timeoutMs: input.timeoutMs ?? null,
          startedAt: now,
        })
        .run();
      const row = db
        .select()
        .from(schema.executorRuns)
        .where(eq(schema.executorRuns.id, id))
        .get()!;
      return mapRow(row);
    },

    async getById(id: string): Promise<ExecutorRunRow | null> {
      const row = db
        .select()
        .from(schema.executorRuns)
        .where(eq(schema.executorRuns.id, id))
        .get();
      return row ? mapRow(row) : null;
    },

    async getByAgentRun(agentRunId: string): Promise<ExecutorRunRow[]> {
      const rows = db
        .select()
        .from(schema.executorRuns)
        .where(eq(schema.executorRuns.agentRunId, agentRunId))
        .orderBy(desc(schema.executorRuns.startedAt))
        .all();
      return rows.map(mapRow);
    },

    async getByWorkspace(workspaceId: string, limit = 50): Promise<ExecutorRunRow[]> {
      const rows = db
        .select()
        .from(schema.executorRuns)
        .where(eq(schema.executorRuns.workspaceId, workspaceId))
        .orderBy(desc(schema.executorRuns.startedAt))
        .limit(limit)
        .all();
      return rows.map(mapRow);
    },

    async getActive(limit = 100): Promise<ExecutorRunRow[]> {
      const rows = db
        .select()
        .from(schema.executorRuns)
        .where(not(inArray(schema.executorRuns.status, TERMINAL_STATUSES)))
        .orderBy(desc(schema.executorRuns.startedAt))
        .limit(limit)
        .all();
      return rows.map(mapRow);
    },

    async update(id: string, data: UpdateExecutorRunInput): Promise<void> {
      const set: Record<string, unknown> = {};
      if (data.status !== undefined) set.status = data.status;
      if (data.pid !== undefined) set.pid = data.pid;
      if (data.exitCode !== undefined) set.exitCode = data.exitCode;
      if (data.error !== undefined) set.error = data.error;
      if (data.failureCategory !== undefined) set.failureCategory = data.failureCategory;
      if (data.environmentConfig !== undefined) set.environmentConfig = JSON.stringify(data.environmentConfig);
      if (data.workingDirectory !== undefined) set.workingDirectory = data.workingDirectory;
      if (data.artifacts !== undefined) set.artifacts = JSON.stringify(data.artifacts);
      if (data.completedAt !== undefined) set.completedAt = data.completedAt;
      if (data.durationMs !== undefined) set.durationMs = data.durationMs;
      if (data.nativeSessionId !== undefined) set.nativeSessionId = data.nativeSessionId;
      if (data.nativeTurnId !== undefined) set.nativeTurnId = data.nativeTurnId;
      if (data.eventCursor !== undefined) set.eventCursor = data.eventCursor;
      if (data.heartbeatAt !== undefined) set.heartbeatAt = data.heartbeatAt;
      if (data.leaseOwner !== undefined) set.leaseOwner = data.leaseOwner;
      if (data.leaseExpiresAt !== undefined) set.leaseExpiresAt = data.leaseExpiresAt;

      if (Object.keys(set).length === 0) return;
      db.update(schema.executorRuns)
        .set(set)
        .where(eq(schema.executorRuns.id, id))
        .run();
    },

    async updateStatus(id: string, status: ExecutorRunStatus, error?: string): Promise<void> {
      const isTerminal = TERMINAL_STATUSES.includes(status);
      const now = new Date().toISOString();

      if (isTerminal) {
        const existing = db
          .select()
          .from(schema.executorRuns)
          .where(eq(schema.executorRuns.id, id))
          .get();
        const durationMs = existing
          ? Date.now() - new Date(existing.startedAt).getTime()
          : null;
        db.update(schema.executorRuns)
          .set({
            status,
            completedAt: now,
            durationMs,
            error: error ?? null,
            heartbeatAt: now,
            leaseOwner: null,
            leaseExpiresAt: null,
          })
          .where(eq(schema.executorRuns.id, id))
          .run();
      } else {
        db.update(schema.executorRuns)
          .set({
            status,
            completedAt: null,
            durationMs: null,
            error: null,
            heartbeatAt: now,
          })
          .where(eq(schema.executorRuns.id, id))
          .run();
      }
    },
  };
}
