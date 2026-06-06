import { eq, desc, and, lt } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as defaultDb, schema } from "../client.js";
import type {
  ApprovalRequestRepository,
  ApprovalRequestRow,
  CreateApprovalRequestInput,
} from "../repository.js";

type DrizzleDb = BetterSQLite3Database<typeof schema>;

function mapRow(row: typeof schema.approvalRequests.$inferSelect): ApprovalRequestRow {
  return {
    id: row.id,
    runId: row.runId,
    toolId: row.toolId,
    toolName: row.toolName,
    args: row.args ? JSON.parse(row.args) : null,
    risk: row.risk,
    status: row.status as ApprovalRequestRow["status"],
    projectScope: row.projectScope,
    decidedAt: row.decidedAt,
    createdAt: row.createdAt,
    mode: row.mode ?? null,
    source: row.source ?? null,
    preview: row.preview ?? null,
    toolCallId: row.toolCallId ?? null,
    expiresAt: row.expiresAt ?? null,
  };
}

export function createSqliteApprovalRepo(database?: DrizzleDb): ApprovalRequestRepository {
  const db = database ?? defaultDb;
  return {
    async create(input: CreateApprovalRequestInput): Promise<ApprovalRequestRow> {
      const id = input.id ?? crypto.randomUUID();
      const now = Date.now();
      db.insert(schema.approvalRequests)
        .values({
          id,
          runId: input.runId,
          toolId: input.toolId,
          toolName: input.toolName,
          args: JSON.stringify(input.args),
          risk: input.risk,
          status: "pending",
          projectScope: input.projectScope ?? false,
          createdAt: now,
          mode: (input.mode ?? "chat") as "chat" | "voice" | "tick" | "scheduled" | "workflow",
          source: input.source ?? null,
          preview: input.preview ?? null,
          toolCallId: input.toolCallId ?? null,
          expiresAt: input.expiresAt ?? null,
        })
        .run();
      const row = db
        .select()
        .from(schema.approvalRequests)
        .where(eq(schema.approvalRequests.id, id))
        .get()!;
      return mapRow(row);
    },

    async getById(id: string): Promise<ApprovalRequestRow | null> {
      const row = db
        .select()
        .from(schema.approvalRequests)
        .where(eq(schema.approvalRequests.id, id))
        .get();
      return row ? mapRow(row) : null;
    },

    async getPending(): Promise<ApprovalRequestRow[]> {
      const rows = db
        .select()
        .from(schema.approvalRequests)
        .where(eq(schema.approvalRequests.status, "pending"))
        .orderBy(desc(schema.approvalRequests.createdAt))
        .all();
      return rows.map(mapRow);
    },

    async getByRunId(runId: string): Promise<ApprovalRequestRow[]> {
      const rows = db
        .select()
        .from(schema.approvalRequests)
        .where(eq(schema.approvalRequests.runId, runId))
        .orderBy(desc(schema.approvalRequests.createdAt))
        .all();
      return rows.map(mapRow);
    },

    async findByToolCallId(toolCallId: string): Promise<ApprovalRequestRow | null> {
      const row = db
        .select()
        .from(schema.approvalRequests)
        .where(
          and(
            eq(schema.approvalRequests.toolCallId, toolCallId),
            eq(schema.approvalRequests.status, "pending"),
          ),
        )
        .get();
      return row ? mapRow(row) : null;
    },

    async approve(id: string): Promise<ApprovalRequestRow> {
      const now = Date.now();
      db.update(schema.approvalRequests)
        .set({ status: "approved", decidedAt: now })
        .where(eq(schema.approvalRequests.id, id))
        .run();
      const row = db
        .select()
        .from(schema.approvalRequests)
        .where(eq(schema.approvalRequests.id, id))
        .get()!;
      return mapRow(row);
    },

    async deny(id: string): Promise<ApprovalRequestRow> {
      const now = Date.now();
      db.update(schema.approvalRequests)
        .set({ status: "denied", decidedAt: now })
        .where(eq(schema.approvalRequests.id, id))
        .run();
      const row = db
        .select()
        .from(schema.approvalRequests)
        .where(eq(schema.approvalRequests.id, id))
        .get()!;
      return mapRow(row);
    },

    async expireStale(maxAgeMs = 300_000): Promise<{ count: number; ids: string[] }> {
      const cutoff = Date.now() - maxAgeMs;
      // Select IDs before updating so we can return them
      const staleRows = db
        .select({ id: schema.approvalRequests.id })
        .from(schema.approvalRequests)
        .where(
          and(
            eq(schema.approvalRequests.status, "pending"),
            lt(schema.approvalRequests.createdAt, cutoff),
          ),
        )
        .all();
      const ids = staleRows.map((r) => r.id);
      if (ids.length === 0) return { count: 0, ids: [] };
      const result = db
        .update(schema.approvalRequests)
        .set({ status: "expired", decidedAt: Date.now() })
        .where(
          and(
            eq(schema.approvalRequests.status, "pending"),
            lt(schema.approvalRequests.createdAt, cutoff),
          ),
        )
        .run();
      return { count: result.changes, ids };
    },
  };
}
