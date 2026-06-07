/**
 * Events emitted by managed runtimes.
 */
export type RuntimeEvent =
  | RuntimeStartedEvent
  | RuntimeStoppedEvent
  | RuntimeHealthChangedEvent
  | RuntimeRunStartedEvent
  | RuntimeRunProgressEvent
  | RuntimeRunCompletedEvent
  | RuntimeRunFailedEvent
  | RuntimeErrorEvent
  | RuntimeCustomEvent;

export interface RuntimeStartedEvent {
  type: 'runtime:started';
  payload: {
    runtimeId: string;
    kind: string;
    timestamp: string;
  };
}

export interface RuntimeStoppedEvent {
  type: 'runtime:stopped';
  payload: {
    runtimeId: string;
    reason?: string;
    timestamp: string;
  };
}

export interface RuntimeHealthChangedEvent {
  type: 'runtime:health_changed';
  payload: {
    runtimeId: string;
    previousHealth: string;
    currentHealth: string;
    timestamp: string;
  };
}

export interface RuntimeRunStartedEvent {
  type: 'run:started';
  payload: {
    runtimeId: string;
    runId: string;
    timestamp: string;
  };
}

export interface RuntimeRunProgressEvent {
  type: 'run:progress';
  payload: {
    runtimeId: string;
    runId: string;
    progress: number;
    message?: string;
    timestamp: string;
  };
}

export interface RuntimeRunCompletedEvent {
  type: 'run:completed';
  payload: {
    runtimeId: string;
    runId: string;
    durationMs: number;
    timestamp: string;
  };
}

export interface RuntimeRunFailedEvent {
  type: 'run:failed';
  payload: {
    runtimeId: string;
    runId: string;
    error: string;
    durationMs: number;
    timestamp: string;
  };
}

export interface RuntimeErrorEvent {
  type: 'runtime:error';
  payload: {
    runtimeId: string;
    error: string;
    stack?: string;
    timestamp: string;
  };
}

export interface RuntimeCustomEvent {
  type: string;
  payload: Record<string, unknown>;
}

/**
 * Helper to create a runtime event with timestamp.
 */
export function createRuntimeEvent<T extends RuntimeEvent>(
  event: Omit<T, 'payload'> & { payload: Omit<T['payload'], 'timestamp'> }
): T {
  return {
    ...event,
    payload: {
      ...event.payload,
      timestamp: new Date().toISOString(),
    },
  } as T;
}
