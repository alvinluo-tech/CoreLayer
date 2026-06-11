/**
 * Scheduler Runtime — manages timers, cron, and autonomous runs.
 *
 * This runtime wraps the existing scheduler.ts and task/ modules,
 * exposing them through the RuntimeProtocol HTTP endpoints.
 */

import type {
  RuntimeCapabilitiesResponse,
  StartRunRequest,
  StartRunResponse,
} from "@jarvis/runtime-protocol";
import { BaseRuntime, BaseRuntimeConfig } from "../base-runtime.js";
import type { ShutdownResponse } from "@jarvis/runtime-protocol";

export interface SchedulerRuntimeConfig extends BaseRuntimeConfig {
  /** TICK interval in ms */
  tickIntervalMs?: number;
  /** Enable autonomous TICK */
  tickEnabled?: boolean;
}

/**
 * Scheduler Runtime implementation.
 */
export class SchedulerRuntime extends BaseRuntime {
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: SchedulerRuntimeConfig) {
    super({ ...config, kind: "scheduler" });
  }

  getCapabilities(): RuntimeCapabilitiesResponse {
    return {
      capabilities: [
        "scheduler:tick",
        "scheduler:cron",
        "scheduler:idle_detection",
        "scheduler:task_execution",
      ],
      supportedEvents: [
        "run:started",
        "run:completed",
        "run:failed",
        "scheduler:tick",
        "scheduler:cron_fire",
      ],
      maxConcurrentRuns: 1,
    };
  }

  override async startRun(request: StartRunRequest): Promise<StartRunResponse> {
    if (this.activeRuns.size >= 1) {
      return {
        runId: request.runId,
        status: "rejected",
        reason: "Tick already in progress",
      };
    }
    return super.startRun(request);
  }

  override async shutdown(_response: ShutdownResponse): Promise<void> {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    await super.shutdown(_response);
  }

  /**
   * Run a TICK using the existing scheduler.
   */
  async runTick(): Promise<{ ran: boolean; reason?: string }> {
    const { runTick } = await import("./scheduler.js");
    return runTick();
  }

  /**
   * Get scheduled tasks from the database.
   */
  async getScheduledTasks(): Promise<
    Array<{
      id: string;
      name: string;
      cronExpr: string;
      enabled: boolean;
      lastRun?: string;
    }>
  > {
    const { getRepositories } = await import("../../persistence/factory.js");
    const repos = getRepositories();
    const tasks = await repos.scheduledTasks.getAll();
    return tasks.map((t) => ({
      id: t.id,
      name: t.name,
      cronExpr: t.cronExpr,
      enabled: t.enabled,
      lastRun: t.lastRun ?? undefined,
    }));
  }

  /** Alias for base completeRun — used by scheduler-specific callers */
  completeTick(tickId: string): void {
    this.completeRun(tickId);
  }

  override createRouter() {
    const app = super.createRouter();

    app.post("/scheduler/tick", async (c) => {
      const result = await this.runTick();
      return c.json(result);
    });

    app.get("/scheduler/tasks", async (c) => {
      const tasks = await this.getScheduledTasks();
      return c.json({ tasks });
    });

    return app;
  }
}

/**
 * Create a new Scheduler Runtime.
 */
export function createSchedulerRuntime(
  config: SchedulerRuntimeConfig,
): SchedulerRuntime {
  return new SchedulerRuntime(config);
}
