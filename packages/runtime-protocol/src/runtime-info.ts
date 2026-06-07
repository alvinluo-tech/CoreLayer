/**
 * Runtime information tracked by the Supervisor.
 */
export interface RuntimeInfo {
  /** Unique runtime identifier */
  id: string;
  /** Runtime kind (agent, tool, coding, voice, scheduler, computer-control) */
  kind: RuntimeKind;
  /** Runtime version */
  version: string;
  /** Supported protocol version */
  protocolVersion: number;
  /** Process ID (if running as separate process) */
  pid?: number;
  /** Current health state */
  health: RuntimeHealth;
  /** HTTP port or IPC channel */
  port?: number;
  /** Path to runtime log file */
  logPath?: string;
  /** Path to runtime app data */
  appDataPath?: string;
  /** Number of times this runtime has been restarted */
  restartCount: number;
  /** Last error message (if any) */
  lastError?: string;
  /** Timestamp of last successful health check */
  lastHealthCheck?: string;
  /** Timestamp when runtime was started */
  startedAt?: string;
}

/**
 * Runtime kind enum.
 */
export type RuntimeKind =
  | 'agent'
  | 'tool'
  | 'coding'
  | 'voice'
  | 'memory'
  | 'scheduler'
  | 'computer-control';

/**
 * Runtime health state.
 */
export type RuntimeHealth = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/**
 * Runtime status with extended information.
 */
export interface RuntimeStatus extends RuntimeInfo {
  /** Whether the runtime is currently processing a run */
  activeRun: boolean;
  /** Current run ID (if active) */
  activeRunId?: string;
  /** Number of completed runs */
  completedRuns: number;
  /** Number of failed runs */
  failedRuns: number;
  /** Average response time in ms */
  avgResponseTimeMs?: number;
  /** Memory usage in bytes */
  memoryUsageBytes?: number;
  /** CPU usage percentage */
  cpuUsagePercent?: number;
}
