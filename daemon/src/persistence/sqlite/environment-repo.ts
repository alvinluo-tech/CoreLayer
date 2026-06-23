import { eq, desc, asc, inArray, not, max } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as defaultDb, schema } from "../client.js";
import type {
  EnvironmentSessionRepository,
  EnvironmentSessionRow,
  CreateEnvironmentSessionInput,
  UpdateEnvironmentSessionInput,
  EnvironmentState,
  EnvironmentEventRepository,
  EnvironmentEventRow,
  CreateEnvironmentEventInput,
} from "../repository/environment.js";

type DrizzleDb = BetterSQLite3Database<typeof schema>;

const TERMINAL_STATES: EnvironmentState[] = ["completed", "failed", "disposed"];

function mapSession(row: typeof schema.environmentSessions.$inferSelect): EnvironmentSessionRow {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    runId: row.runId,
    agentId: row.agentId,
    environmentKind: row.environmentKind,
    state: row.state as EnvironmentState,
    workingDirectory: row.workingDirectory,
    accessPolicy: row.accessPolicy ? JSON.parse(row.accessPolicy) : {},
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapEvent(row: typeof schema.environmentEvents.$inferSelect): EnvironmentEventRow {
  return {
    id: row.id,
    sessionId: row.sessionId,
    sequence: row.sequence,
    type: row.type,
    payload: row.payload ? JSON.parse(row.payload) : null,
    createdAt: row.createdAt,
  };
}

export function createSqliteEnvironmentSessionRepo(database?: DrizzleDb): EnvironmentSessionRepository {
  const db = database ?? defaultDb;

  return {
    async create(input: CreateEnvironmentSessionInput): Promise<EnvironmentSessionRow> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.insert(schema.environmentSessions)
        .values({
          id,
          workspaceId: input.workspaceId,
          projectId: input.projectId ?? null,
          runId: input.runId ?? null,
          agentId: input.agentId ?? null,
          environmentKind: input.environmentKind,
          state: "created",
          workingDirectory: input.workingDirectory ?? null,
          accessPolicy: input.accessPolicy ? JSON.stringify(input.accessPolicy) : "{}",
          metadata: input.metadata ? JSON.stringify(input.metadata) : "{}",
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const row = db
        .select()
        .from(schema.environmentSessions)
        .where(eq(schema.environmentSessions.id, id))
        .get()!;
      return mapSession(row);
    },

    async getById(id: string): Promise<EnvironmentSessionRow | null> {
      const row = db
        .select()
        .from(schema.environmentSessions)
        .where(eq(schema.environmentSessions.id, id))
        .get();
      return row ? mapSession(row) : null;
    },

    async getByRun(runId: string): Promise<EnvironmentSessionRow[]> {
      const rows = db
        .select()
        .from(schema.environmentSessions)
        .where(eq(schema.environmentSessions.runId, runId))
        .orderBy(desc(schema.environmentSessions.createdAt))
        .all();
      return rows.map(mapSession);
    },

    async getByWorkspace(workspaceId: string, limit = 50): Promise<EnvironmentSessionRow[]> {
      const rows = db
        .select()
        .from(schema.environmentSessions)
        .where(eq(schema.environmentSessions.workspaceId, workspaceId))
        .orderBy(desc(schema.environmentSessions.createdAt))
        .limit(limit)
        .all();
      return rows.map(mapSession);
    },

    async getActive(limit = 100): Promise<EnvironmentSessionRow[]> {
      const rows = db
        .select()
        .from(schema.environmentSessions)
        .where(not(inArray(schema.environmentSessions.state, TERMINAL_STATES)))
        .orderBy(desc(schema.environmentSessions.createdAt))
        .limit(limit)
        .all();
      return rows.map(mapSession);
    },

    async update(id: string, data: UpdateEnvironmentSessionInput): Promise<void> {
      const now = new Date().toISOString();
      const set: Record<string, unknown> = { updatedAt: now };
      if (data.state !== undefined) set.state = data.state;
      if (data.workingDirectory !== undefined) set.workingDirectory = data.workingDirectory;
      if (data.accessPolicy !== undefined) set.accessPolicy = JSON.stringify(data.accessPolicy);
      if (data.metadata !== undefined) set.metadata = JSON.stringify(data.metadata);

      db.update(schema.environmentSessions)
        .set(set)
        .where(eq(schema.environmentSessions.id, id))
        .run();
    },

    async updateState(id: string, state: EnvironmentState): Promise<void> {
      const now = new Date().toISOString();
      db.update(schema.environmentSessions)
        .set({ state, updatedAt: now })
        .where(eq(schema.environmentSessions.id, id))
        .run();
    },

    async dispose(id: string): Promise<void> {
      const now = new Date().toISOString();
      db.update(schema.environmentSessions)
        .set({ state: "disposed", updatedAt: now })
        .where(eq(schema.environmentSessions.id, id))
        .run();
    },
  };
}

export function createSqliteEnvironmentEventRepo(database?: DrizzleDb): EnvironmentEventRepository {
  const db = database ?? defaultDb;

  return {
    async create(input: CreateEnvironmentEventInput): Promise<EnvironmentEventRow> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const nextSeq = await this.getNextSequence(input.sessionId);

      db.insert(schema.environmentEvents)
        .values({
          id,
          sessionId: input.sessionId,
          sequence: nextSeq,
          type: input.type,
          payload: input.payload ? JSON.stringify(input.payload) : null,
          createdAt: now,
        })
        .run();

      return {
        id,
        sessionId: input.sessionId,
        sequence: nextSeq,
        type: input.type,
        payload: input.payload ?? null,
        createdAt: now,
      };
    },

    async getBySession(sessionId: string, limit = 500): Promise<EnvironmentEventRow[]> {
      const rows = db
        .select()
        .from(schema.environmentEvents)
        .where(eq(schema.environmentEvents.sessionId, sessionId))
        .orderBy(asc(schema.environmentEvents.sequence))
        .limit(limit)
        .all();
      return rows.map(mapEvent);
    },

    async getNextSequence(sessionId: string): Promise<number> {
      const result = db
        .select({ maxSeq: max(schema.environmentEvents.sequence) })
        .from(schema.environmentEvents)
        .where(eq(schema.environmentEvents.sessionId, sessionId))
        .get();
      return (result?.maxSeq ?? 0) + 1;
    },
  };
}
