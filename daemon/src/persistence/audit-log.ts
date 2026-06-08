/**
 * Audit Log — facade for logging and querying audit entries.
 *
 * Uses the existing audit_log table and repository.
 * Provides a simplified API for coding adapters to log permission decisions.
 */

import { getRepositories } from "./factory.js";
import type { AuditLogFilters, AuditLogRow } from "./repository.js";

export interface AuditEntry {
  actor: string;
  action: string;
  resource: string;
  decision: string;
  result?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log an audit entry to the audit_log table.
 */
export async function logAuditEntry(entry: AuditEntry): Promise<void> {
  try {
    const repos = getRepositories();
    await repos.auditLog.create({
      actor: entry.actor,
      action: entry.action,
      resource: entry.resource,
      permissionDecision: entry.decision,
      result: entry.result,
      metadata: entry.metadata,
    });
  } catch (err) {
    // Audit logging should never crash the caller
    console.error("[audit-log] Failed to write audit entry:", err);
  }
}

/**
 * Query audit log entries with optional filters.
 */
export async function getAuditLog(
  filters?: AuditLogFilters,
): Promise<AuditLogRow[]> {
  const repos = getRepositories();
  return repos.auditLog.query(filters);
}
