/**
 * Lifecycle hooks for managed runtimes.
 */
export interface RuntimeLifecycle {
  /** Called when runtime is starting */
  onStart(): Promise<void>;

  /** Called when runtime is stopping */
  onStop(): Promise<void>;

  /** Called when runtime needs to perform health check */
  onHealthCheck(): Promise<boolean>;

  /** Called when a run is starting */
  onRunStart(runId: string): Promise<void>;

  /** Called when a run completes */
  onRunComplete(runId: string): Promise<void>;

  /** Called when a run fails */
  onRunFail(runId: string, error: Error): Promise<void>;
}

/**
 * Default lifecycle implementation (no-op).
 */
export const defaultLifecycle: RuntimeLifecycle = {
  async onStart() {},
  async onStop() {},
  async onHealthCheck() {
    return true;
  },
  async onRunStart() {},
  async onRunComplete() {},
  async onRunFail() {},
};
