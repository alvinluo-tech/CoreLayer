/**
 * Scheduler Runtime — manages timers, cron, and autonomous runs.
 *
 * This runtime wraps the existing scheduler.ts and task/ modules,
 * exposing them through the RuntimeProtocol HTTP endpoints.
 */

import type {
  ManagedRuntime,
  CreateManagedRuntimeInput,
} from "@jarvis/runtime-core";
import type {
  RuntimeInfo,
  RuntimeStatus,
  RuntimeCapabilitiesResponse,
  RuntimeEvent,
  StartRunRequest,
  StartRunResponse,
  CancelRunRequest,
  CancelRunResponse,
  ShutdownResponse,
  RuntimeHealth,
} from "@jarvis/runtime-protocol";
import { Hono } from "hono";
import { cors } from "hono/cors";

export interface SchedulerRuntimeConfig extends CreateManagedRuntimeInput {
  /** TICK interval in ms */
  tickIntervalMs?: number;
  /** Enable autonomous TICK */
  tickEnabled?: boolean;
}

interface ActiveTick {
  id: string;
  startedAt: string;
  abortController: AbortController;
}

/**
 * Scheduler Runtime implementation.
 */
export class SchedulerRuntime implements ManagedRuntime {
  private info: RuntimeInfo;
  private health: RuntimeHealth = "unknown";
  private activeTicks = new Map<string, ActiveTick>();
  private completedTicks = 0;
  private failedTicks = 0;
  private startedAt: string | null = null;
  private eventListeners: Set<(event: RuntimeEvent) => void> = new Set();
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: SchedulerRuntimeConfig) {
    this.info = {
      id: config.id,
      kind: "scheduler",
      version: config.version,
      protocolVersion: 1,
      health: "unknown",
      port: config.port,
      appDataPath: config.appDataPath,
      logPath: config.logPath,
      restartCount: 0,
    };
  }

  getInfo(): RuntimeInfo {
    return { ...this.info };
  }

  async getStatus(): Promise<RuntimeStatus> {
    const uptime = this.startedAt
      ? Date.now() - new Date(this.startedAt).getTime()
      : 0;

    const firstTick = this.activeTicks.values().next();
    const activeRunId = !firstTick.done ? firstTick.value.id : undefined;

    return {
      ...this.info,
      health: this.health,
      activeRun: this.activeTicks.size > 0,
      activeRunId,
      completedRuns: this.completedTicks,
      failedRuns: this.failedTicks,
      uptime,
    };
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

  async startRun(request: StartRunRequest): Promise<StartRunResponse> {
    if (this.activeTicks.size >= 1) {
      return {
        runId: request.runId,
        status: "rejected",
        reason: "Tick already in progress",
      };
    }

    const abortController = new AbortController();
    this.activeTicks.set(request.runId, {
      id: request.runId,
      startedAt: new Date().toISOString(),
      abortController,
    });

    this.emitEvent({
      type: "run:started",
      payload: {
        runtimeId: this.info.id,
        runId: request.runId,
        timestamp: new Date().toISOString(),
      },
    });

    return {
      runId: request.runId,
      status: "started",
    };
  }

  async cancelRun(request: CancelRunRequest): Promise<CancelRunResponse> {
    const tick = this.activeTicks.get(request.runId);
    if (!tick) {
      return { runId: request.runId, status: "not_found" };
    }

    tick.abortController.abort();
    this.handleTickFailed(request.runId, request.reason ?? "Cancelled by user");

    return {
      runId: request.runId,
      status: "cancelled",
    };
  }

  async *subscribeToEvents(): AsyncIterable<RuntimeEvent> {
    const queue: RuntimeEvent[] = [];
    let resolve: (() => void) | null = null;

    const listener = (event: RuntimeEvent) => {
      queue.push(event);
      resolve?.();
    };

    this.eventListeners.add(listener);

    try {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          await new Promise<void>((r) => {
            resolve = r;
          });
        }
      }
    } finally {
      this.eventListeners.delete(listener);
    }
  }

  async shutdown(_response: ShutdownResponse): Promise<void> {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    for (const [tickId, tick] of this.activeTicks) {
      tick.abortController.abort();
      this.handleTickFailed(tickId, "Runtime shutting down");
    }

    this.health = "unhealthy";
    this.info.health = "unhealthy";
  }

  async healthCheck(): Promise<boolean> {
    try {
      this.health = "healthy";
      this.info.health = "healthy";
      this.info.lastHealthCheck = new Date().toISOString();
      return true;
    } catch {
      this.health = "unhealthy";
      this.info.health = "unhealthy";
      return false;
    }
  }

  /**
   * Run a TICK using the existing scheduler.
   */
  async runTick(): Promise<{ ran: boolean; reason?: string }> {
    const { runTick } = await import("../../scheduler.js");
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
    const { getRepositories } = await import("../../db/factory.js");
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

  /**
   * Mark a tick as completed.
   */
  completeTick(tickId: string): void {
    const tick = this.activeTicks.get(tickId);
    if (!tick) return;

    this.activeTicks.delete(tickId);
    this.completedTicks++;

    this.emitEvent({
      type: "run:completed",
      payload: {
        runtimeId: this.info.id,
        runId: tickId,
        durationMs: Date.now() - new Date(tick.startedAt).getTime(),
        timestamp: new Date().toISOString(),
      },
    });
  }

  private handleTickFailed(tickId: string, error: string): void {
    const tick = this.activeTicks.get(tickId);
    if (!tick) return;

    this.activeTicks.delete(tickId);
    this.failedTicks++;

    this.emitEvent({
      type: "run:failed",
      payload: {
        runtimeId: this.info.id,
        runId: tickId,
        error,
        durationMs: Date.now() - new Date(tick.startedAt).getTime(),
        timestamp: new Date().toISOString(),
      },
    });
  }

  private emitEvent(event: RuntimeEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  /**
   * Create a Hono router with RuntimeProtocol endpoints.
   */
  createRouter(): Hono {
    const app = new Hono();
    app.use("/*", cors());

    // GET /health
    app.get("/health", async (c) => {
      const uptime = this.startedAt
        ? Date.now() - new Date(this.startedAt).getTime()
        : 0;
      return c.json({
        status: this.health === "healthy" ? "ok" : "error",
        timestamp: new Date().toISOString(),
        uptime,
      });
    });

    // GET /runtime/status
    app.get("/runtime/status", async (c) => {
      const status = await this.getStatus();
      return c.json(status);
    });

    // GET /runtime/capabilities
    app.get("/runtime/capabilities", async (c) => {
      const caps = this.getCapabilities();
      return c.json(caps);
    });

    // POST /runtime/start-run
    app.post("/runtime/start-run", async (c) => {
      const body = await c.req.json<StartRunRequest>();
      const result = await this.startRun(body);
      return c.json(result);
    });

    // POST /runtime/cancel-run
    app.post("/runtime/cancel-run", async (c) => {
      const body = await c.req.json<CancelRunRequest>();
      const result = await this.cancelRun(body);
      return c.json(result);
    });

    // POST /runtime/shutdown
    app.post("/runtime/shutdown", async (c) => {
      const body = await c.req.json<ShutdownResponse>();
      await this.shutdown(body);
      return c.json({
        status: "shutdown_initiated",
        timestamp: new Date().toISOString(),
      });
    });

    // POST /scheduler/tick
    app.post("/scheduler/tick", async (c) => {
      const result = await this.runTick();
      return c.json(result);
    });

    // GET /scheduler/tasks
    app.get("/scheduler/tasks", async (c) => {
      const tasks = await this.getScheduledTasks();
      return c.json({ tasks });
    });

    return app;
  }

  /**
   * Start the runtime.
   */
  async start(): Promise<void> {
    this.startedAt = new Date().toISOString();
    this.info.startedAt = this.startedAt;
    await this.healthCheck();

    this.emitEvent({
      type: "runtime:started",
      payload: {
        runtimeId: this.info.id,
        kind: "scheduler",
        timestamp: new Date().toISOString(),
      },
    });
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
