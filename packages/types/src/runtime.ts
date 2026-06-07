/**
 * Runtime kind enum - matches @jarvis/runtime-protocol RuntimeKind
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
 * Runtime state in the lifecycle.
 */
export type RuntimeState =
  | 'initializing'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'failed'
  | 'restarting';

/**
 * Configuration for a managed runtime.
 */
export interface RuntimeConfig {
  /** Unique runtime identifier */
  id: string;
  /** Runtime kind */
  kind: RuntimeKind;
  /** Runtime version */
  version: string;
  /** Port to listen on (if HTTP-based) */
  port?: number;
  /** Path to app data directory */
  appDataPath: string;
  /** Path to log directory */
  logPath: string;
  /** Maximum memory in bytes */
  maxMemoryBytes?: number;
  /** Timeout for runs in ms */
  runTimeoutMs?: number;
  /** Maximum concurrent runs */
  maxConcurrentRuns?: number;
  /** Health check interval in ms */
  healthCheckIntervalMs?: number;
  /** Auto-restart on failure */
  autoRestart?: boolean;
  /** Maximum restart attempts */
  maxRestartAttempts?: number;
  /** Additional configuration */
  options?: Record<string, unknown>;
}

/**
 * Health status of a runtime.
 */
export type RuntimeHealth = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/**
 * Runtime capabilities.
 */
export interface RuntimeCapabilities {
  /** List of capability names */
  capabilities: string[];
  /** Supported event types */
  supportedEvents: string[];
  /** Maximum concurrent runs */
  maxConcurrentRuns: number;
}
