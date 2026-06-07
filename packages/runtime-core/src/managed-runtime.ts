import type {
  RuntimeInfo,
  RuntimeKind,
  RuntimeStatus,
  RuntimeCapabilitiesResponse,
  RuntimeEvent,
  StartRunRequest,
  StartRunResponse,
  CancelRunRequest,
  CancelRunResponse,
  ShutdownResponse,
} from '@jarvis/runtime-protocol';

/**
 * Interface that all managed runtimes must implement.
 */
export interface ManagedRuntime {
  /** Get runtime information */
  getInfo(): RuntimeInfo;

  /** Start the runtime (initialize lifecycle/status only, no autonomous loops) */
  start(): Promise<void>;

  /** Get detailed runtime status */
  getStatus(): Promise<RuntimeStatus>;

  /** Get runtime capabilities */
  getCapabilities(): RuntimeCapabilitiesResponse;

  /** Start a new run */
  startRun(request: StartRunRequest): Promise<StartRunResponse>;

  /** Cancel an active run */
  cancelRun(request: CancelRunRequest): Promise<CancelRunResponse>;

  /** Subscribe to runtime events */
  subscribeToEvents(): AsyncIterable<RuntimeEvent>;

  /** Gracefully shutdown the runtime */
  shutdown(response: ShutdownResponse): Promise<void>;

  /** Perform a health check */
  healthCheck(): Promise<boolean>;
}

/**
 * Input for creating a managed runtime.
 */
export interface CreateManagedRuntimeInput {
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
  /** Additional configuration */
  config?: Record<string, unknown>;
}
