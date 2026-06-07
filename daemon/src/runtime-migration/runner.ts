/**
 * Migration Runner — executes schema migrations with graceful failure handling.
 *
 * On migration failure, the system enters degraded mode rather than
 * destroying user data.
 */

import type {
  MigrationStep,
  MigrationResult,
  MigrationStatus,
  SchemaVersion,
} from "./types.js";

/** In-memory schema version tracking (will be persisted to DB) */
const schemaVersions = new Map<string, SchemaVersion>();

/** Registered migrations */
const migrations: MigrationStep[] = [];

/**
 * Register a migration step.
 */
export function registerMigration(step: MigrationStep): void {
  migrations.push(step);
}

/**
 * Get the current schema version for a component.
 */
export function getSchemaVersion(component: "app" | "daemon" | "runtime"): SchemaVersion | undefined {
  return schemaVersions.get(component);
}

/**
 * Set the schema version for a component (used after successful migration).
 */
export function setSchemaVersion(component: "app" | "daemon" | "runtime", version: number, description: string): void {
  schemaVersions.set(component, {
    component,
    version,
    description,
    appliedAt: new Date().toISOString(),
  });
}

/**
 * Run all pending migrations for a component.
 * Returns the migration result with status.
 */
export async function runMigrations(
  component: "app" | "daemon" | "runtime",
  currentVersion: number,
): Promise<MigrationResult> {
  const applied: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  let status: MigrationStatus = "completed";

  // Filter migrations for this component that are newer than current version
  const pending = migrations
    .filter((m) => m.component === component && m.targetVersion > currentVersion)
    .sort((a, b) => a.targetVersion - b.targetVersion);

  for (const step of pending) {
    try {
      await step.up();
      applied.push(step.id);
      setSchemaVersion(component, step.targetVersion, step.description);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      failed.push({ id: step.id, error: errorMessage });

      // Attempt rollback if available
      if (step.down) {
        try {
          await step.down();
        } catch {
          // Rollback also failed — enter degraded mode
        }
      }

      status = "degraded";
      // Don't continue after a failure — enter degraded mode
      break;
    }
  }

  if (pending.length === 0) {
    status = "completed";
  }

  const versions = Array.from(schemaVersions.values());

  return { status, applied, failed, versions };
}

/**
 * Check if the runtime protocol version is compatible.
 */
export function isProtocolCompatible(
  localVersion: number,
  remoteVersion: number,
): boolean {
  // Same major version is compatible
  return localVersion === remoteVersion;
}

/**
 * Enter degraded mode — log the issue but don't crash.
 */
export function enterDegradedMode(reason: string): void {
  console.error(`[Jarvis] DEGRADED MODE: ${reason}`);
  console.error("[Jarvis] Some features may be unavailable until the issue is resolved.");
}

/**
 * Clear all registered migrations (for testing).
 */
export function clearMigrations(): void {
  migrations.length = 0;
  schemaVersions.clear();
}
