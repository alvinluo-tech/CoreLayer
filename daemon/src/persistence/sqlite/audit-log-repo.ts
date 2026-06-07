import { eq, desc, and, gte, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as defaultDb, schema } from "../client.js";
import type {
  AuditLogRepository,
  AuditLogRow,
  CreateAuditLogInput,
  AuditLogFilters,
} from "../repository.js";

type DrizzleDb = BetterSQLite3Database<typeof schema>;

function normalize(row: typeof schema.auditLog.$inferSelect): AuditLogRow {
  return {
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  };
}

export function createSqliteAuditLogRepo(database?: DrizzleDb): AuditLogRepository {
  const db = database ?? defaultDb;
  return {
    async create(input: CreateAuditLogInput): Promise<AuditLogRow> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.insert(schema.auditLog)
        .values({
          id,
          actor: input.actor,
          action: input.action,
          resource: input.resource,
          riskLevel: input.riskLevel ?? null,
          permissionDecision: input.permissionDecision ?? null,
          confirmedByUser: input.confirmedByUser ?? null,
          result: input.result ?? null,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
          createdAt: now,
        })
        .run();
      const row = db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.id, id))
        .get()!;
      return normalize(row);
    },

    async query(filters?: AuditLogFilters): Promise<AuditLogRow[]> {
      const conditions = [];
      if (filters?.actor) conditions.push(eq(schema.auditLog.actor, filters.actor));
      if (filters?.action) conditions.push(eq(schema.auditLog.action, filters.action));
      if (filters?.riskLevel) conditions.push(eq(schema.auditLog.riskLevel, filters.riskLevel));
      if (filters?.since) conditions.push(gte(schema.auditLog.createdAt, filters.since));

      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const limit = filters?.limit ?? 50;
      const offset = filters?.offset ?? 0;

      const rows = db
        .select()
        .from(schema.auditLog)
        .where(where)
        .orderBy(desc(schema.auditLog.createdAt))
        .limit(limit)
        .offset(offset)
        .all();
      return rows.map(normalize);
    },

    async count(filters?: AuditLogFilters): Promise<number> {
      const conditions = [];
      if (filters?.actor) conditions.push(eq(schema.auditLog.actor, filters.actor));
      if (filters?.action) conditions.push(eq(schema.auditLog.action, filters.action));
      if (filters?.riskLevel) conditions.push(eq(schema.auditLog.riskLevel, filters.riskLevel));
      if (filters?.since) conditions.push(gte(schema.auditLog.createdAt, filters.since));

      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const result = db
        .select({ count: sql<number>`count(*)` })
        .from(schema.auditLog)
        .where(where)
        .get()!;
      return result.count;
    },
  };
}
