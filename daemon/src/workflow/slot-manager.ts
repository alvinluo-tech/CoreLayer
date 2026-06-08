/**
 * Slot Manager — controls concurrency limits for agent runs.
 *
 * Tracks active run slots and enforces configurable limits
 * for both agent runs and external executor processes.
 */

export interface SlotConfig {
  maxConcurrentAgentRuns: number;
  maxConcurrentExternalExecutors: number;
}

export interface SlotUsage {
  activeAgentRuns: number;
  activeExternalExecutors: number;
  agentRunCapacity: number;
  externalExecutorCapacity: number;
  agentRunQueueDepth: number;
}

const DEFAULT_CONFIG: SlotConfig = {
  maxConcurrentAgentRuns: 3,
  maxConcurrentExternalExecutors: 1,
};

export class SlotManager {
  private config: SlotConfig;
  private activeAgentRuns = new Set<string>();
  private activeExternalExecutors = new Set<string>();
  private agentRunQueueDepth = 0;

  constructor(config?: Partial<SlotConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  canStartAgentRun(): boolean {
    return this.activeAgentRuns.size < this.config.maxConcurrentAgentRuns;
  }

  canStartExternalExecutor(): boolean {
    return this.activeExternalExecutors.size < this.config.maxConcurrentExternalExecutors;
  }

  acquireAgentRun(runId: string): boolean {
    if (this.activeAgentRuns.size >= this.config.maxConcurrentAgentRuns) {
      return false;
    }
    this.activeAgentRuns.add(runId);
    return true;
  }

  releaseAgentRun(runId: string): void {
    this.activeAgentRuns.delete(runId);
  }

  acquireExternalExecutor(processId: string): boolean {
    if (this.activeExternalExecutors.size >= this.config.maxConcurrentExternalExecutors) {
      return false;
    }
    this.activeExternalExecutors.add(processId);
    return true;
  }

  releaseExternalExecutor(processId: string): void {
    this.activeExternalExecutors.delete(processId);
  }

  setAgentRunQueueDepth(depth: number): void {
    this.agentRunQueueDepth = depth;
  }

  getUsage(): SlotUsage {
    return {
      activeAgentRuns: this.activeAgentRuns.size,
      activeExternalExecutors: this.activeExternalExecutors.size,
      agentRunCapacity: this.config.maxConcurrentAgentRuns,
      externalExecutorCapacity: this.config.maxConcurrentExternalExecutors,
      agentRunQueueDepth: this.agentRunQueueDepth,
    };
  }

  getConfig(): Readonly<SlotConfig> {
    return { ...this.config };
  }

  updateConfig(patch: Partial<SlotConfig>): void {
    this.config = { ...this.config, ...patch };
  }
}
