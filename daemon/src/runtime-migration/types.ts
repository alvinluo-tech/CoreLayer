/**
 * Runtime Migration types.
 *
 * Defines the protocol version contract between Rust/Tauri Core and
 * TypeScript runtime, plus the data migration runner.
 */

/** Current runtime protocol version */
export const RUNTIME_PROTOCOL_VERSION = 1;

/** Version information exchanged between Core and Runtime */
export interface RuntimeProtocolVersion {
  /** Protocol version number */
  version: number;
  /** Application version (semver) */
  appVersion: string;
  /** Runtime identifier */
  runtimeId: string;
  /** Timestamp of version check */
  checkedAt: string;
}

/** Schema version tracking */
export interface SchemaVersion {
  /** Component that owns this schema */
  component: "app" | "daemon" | "runtime";
  /** Current schema version number */
  version: number;
  /** Description of the schema version */
  description: string;
  /** When this version was applied */
  appliedAt: string;
}

/** Migration status */
export type MigrationStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "degraded";

/** A single migration step */
export interface MigrationStep {
  /** Unique migration ID */
  id: string;
  /** Component this migration belongs to */
  component: "app" | "daemon" | "runtime";
  /** Version this migration brings the schema to */
  targetVersion: number;
  /** Human-readable description */
  description: string;
  /** The migration function */
  up: () => Promise<void>;
  /** Optional rollback function */
  down?: () => Promise<void>;
}

/** Result of running migrations */
export interface MigrationResult {
  status: MigrationStatus;
  /** Migrations that were applied */
  applied: string[];
  /** Migrations that failed */
  failed: Array<{ id: string; error: string }>;
  /** Current schema versions after migration */
  versions: SchemaVersion[];
}

/** Update check result from UpdateManager */
export interface UpdateCheckResult {
  /** Whether an update is available */
  available: boolean;
  /** Current version */
  currentVersion: string;
  /** Latest available version */
  latestVersion?: string;
  /** Release notes URL */
  releaseUrl?: string;
  /** Whether the update is critical (security fix) */
  critical?: boolean;
}

/** Update Manager contract (TS-side interface for Rust Core) */
export interface UpdateManager {
  /** Check for available updates */
  checkForUpdates(): Promise<UpdateCheckResult>;
  /** Get current app version */
  getCurrentVersion(): string;
  /** Get runtime protocol version */
  getProtocolVersion(): RuntimeProtocolVersion;
}
