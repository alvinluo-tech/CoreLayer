import type { RuntimeKind } from '@jarvis/runtime-protocol';

/**
 * Interface for managing runtime processes.
 */
export interface ProcessSupervisor {
  /** Start a runtime process */
  startProcess(kind: RuntimeKind, options: ProcessStartOptions): Promise<ProcessInfo>;

  /** Stop a runtime process */
  stopProcess(processId: string, options?: ProcessStopOptions): Promise<void>;

  /** Get process information */
  getProcess(processId: string): ProcessInfo | undefined;

  /** Get all running processes */
  getRunningProcesses(): ProcessInfo[];

  /** Restart a process */
  restartProcess(processId: string): Promise<ProcessInfo>;

  /** Check if a process is healthy */
  checkHealth(processId: string): Promise<boolean>;

  /** Subscribe to process events */
  subscribeToEvents(): AsyncIterable<ProcessEvent>;
}

/**
 * Options for starting a process.
 */
export interface ProcessStartOptions {
  /** Command to execute */
  command: string;
  /** Arguments */
  args?: string[];
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Maximum memory in bytes */
  maxMemoryBytes?: number;
  /** Timeout in ms (0 = no timeout) */
  timeoutMs?: number;
}

/**
 * Options for stopping a process.
 */
export interface ProcessStopOptions {
  /** Force kill after timeout */
  forceKillTimeoutMs?: number;
  /** Reason for stopping */
  reason?: string;
}

/**
 * Information about a running process.
 */
export interface ProcessInfo {
  /** Process ID */
  id: string;
  /** OS process ID */
  pid: number;
  /** Runtime kind */
  kind: RuntimeKind;
  /** Process state */
  state: ProcessState;
  /** Start time */
  startedAt: string;
  /** Exit code (if terminated) */
  exitCode?: number;
  /** Error message (if failed) */
  error?: string;
  /** Memory usage in bytes */
  memoryUsageBytes?: number;
  /** CPU usage percentage */
  cpuUsagePercent?: number;
}

/**
 * Process state.
 */
export type ProcessState = 'starting' | 'running' | 'stopping' | 'stopped' | 'failed' | 'crashed';

/**
 * Events emitted by the process supervisor.
 */
export type ProcessEvent =
  | ProcessStartedEvent
  | ProcessStoppedEvent
  | ProcessFailedEvent
  | ProcessHealthChangedEvent;

export interface ProcessStartedEvent {
  type: 'process:started';
  payload: {
    processId: string;
    pid: number;
    kind: string;
    timestamp: string;
  };
}

export interface ProcessStoppedEvent {
  type: 'process:stopped';
  payload: {
    processId: string;
    exitCode: number;
    reason?: string;
    timestamp: string;
  };
}

export interface ProcessFailedEvent {
  type: 'process:failed';
  payload: {
    processId: string;
    error: string;
    timestamp: string;
  };
}

export interface ProcessHealthChangedEvent {
  type: 'process:health_changed';
  payload: {
    processId: string;
    healthy: boolean;
    timestamp: string;
  };
}
