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

/**
 * Extra slots reserved for delegated child runs.
 *
 * A parent that waits for its child holds its own slot while it waits. If the
 * queue is otherwise full, the child can never start and the two deadlock until
 * the wait times out — a failure that looks like a slow executor. Children are
 * therefore not counted against the parent's budget.
 */
const DELEGATED_SLOT_ALLOWANCE = 3;

export class SlotManager {
  private config: SlotConfig;
  private activeAgentRuns = new Set<string>();
  private activeDelegatedRuns = new Set<string>();
  private activeExternalExecutors = new Set<string>();
  private agentRunQueueDepth = 0;

  constructor(config?: Partial<SlotConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  canStartAgentRun(options: { delegated?: boolean } = {}): boolean {
    if (options.delegated) return this.activeDelegatedRuns.size < DELEGATED_SLOT_ALLOWANCE;
    return this.activeAgentRuns.size < this.config.maxConcurrentAgentRuns;
  }

  canStartExternalExecutor(): boolean {
    return this.activeExternalExecutors.size < this.config.maxConcurrentExternalExecutors;
  }

  /**
   * Take a slot. `delegated` marks a child run, which draws on its own
   * allowance: a parent blocked waiting on a child could otherwise never let
   * that child start.
   */
  acquireAgentRun(runId: string, options: { delegated?: boolean } = {}): boolean {
    if (options.delegated) {
      if (this.activeDelegatedRuns.has(runId)) return true;
      // A delegated run re-acquired as a parent (e.g. after a restart) keeps the
      // one slot it already holds rather than counting twice.
      if (this.activeDelegatedRuns.size >= DELEGATED_SLOT_ALLOWANCE) return false;
      this.activeDelegatedRuns.add(runId);
      return true;
    }
    if (this.activeAgentRuns.has(runId)) return true;
    if (this.activeAgentRuns.size >= this.config.maxConcurrentAgentRuns) return false;
    this.activeAgentRuns.add(runId);
    return true;
  }

  releaseAgentRun(runId: string): void {
    this.activeAgentRuns.delete(runId);
    this.activeDelegatedRuns.delete(runId);
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
