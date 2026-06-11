/**
 * BaseRuntime — shared abstract class for all ManagedRuntime implementations.
 *
 * Extracts duplicated boilerplate from agent, coding, scheduler, tool,
 * voice, and memory runtimes: constructor, getInfo, healthCheck, start,
 * subscribeToEvents, emitEvent, and createRouter (common routes).
 *
 * Subclasses only override: getName, getCapabilities, createRouter (to add
 * custom routes via `super.createRouter()`), and any domain-specific methods.
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
  RuntimeKind,
} from "@jarvis/runtime-protocol";
import { Hono } from "hono";
import { cors } from "hono/cors";

export interface BaseRuntimeConfig extends CreateManagedRuntimeInput {
  kind: RuntimeKind;
}

interface ActiveRun {
  id: string;
  startedAt: string;
  abortController: AbortController;
}

export abstract class BaseRuntime implements ManagedRuntime {
  protected info: RuntimeInfo;
  protected health: RuntimeHealth = "unknown";
  protected activeRuns = new Map<string, ActiveRun>();
  protected completedRuns = 0;
  protected failedRuns = 0;
  protected startedAt: string | null = null;
  protected eventListeners: Set<(event: RuntimeEvent) => void> = new Set();

  constructor(config: BaseRuntimeConfig) {
    this.info = {
      id: config.id,
      kind: config.kind as RuntimeInfo["kind"],
      version: config.version,
      protocolVersion: 1,
      health: "unknown",
      port: config.port,
      appDataPath: config.appDataPath,
      logPath: config.logPath,
      restartCount: 0,
    };
  }

  abstract getCapabilities(): RuntimeCapabilitiesResponse;

  getInfo(): RuntimeInfo {
    return { ...this.info };
  }

  async getStatus(): Promise<RuntimeStatus> {
    const uptime = this.startedAt
      ? Date.now() - new Date(this.startedAt).getTime()
      : 0;

    const first = this.activeRuns.values().next();
    const activeRunId = !first.done ? first.value.id : undefined;

    return {
      ...this.info,
      health: this.health,
      activeRun: this.activeRuns.size > 0,
      activeRunId,
      completedRuns: this.completedRuns,
      failedRuns: this.failedRuns,
      uptime,
    };
  }

  async startRun(request: StartRunRequest): Promise<StartRunResponse> {
    const abortController = new AbortController();
    this.activeRuns.set(request.runId, {
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

    return { runId: request.runId, status: "started" };
  }

  async cancelRun(request: CancelRunRequest): Promise<CancelRunResponse> {
    const run = this.activeRuns.get(request.runId);
    if (!run) {
      return { runId: request.runId, status: "not_found" };
    }

    run.abortController.abort();
    this.handleRunFailed(request.runId, request.reason ?? "Cancelled by user");

    return { runId: request.runId, status: "cancelled" };
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

  async start(): Promise<void> {
    this.startedAt = new Date().toISOString();
    this.info.startedAt = this.startedAt;
    await this.healthCheck();

    this.emitEvent({
      type: "runtime:started",
      payload: {
        runtimeId: this.info.id,
        kind: this.info.kind,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async shutdown(_response?: ShutdownResponse): Promise<void> {
    for (const [runId, run] of this.activeRuns) {
      run.abortController.abort();
      this.handleRunFailed(runId, "Runtime shutting down");
    }

    this.health = "unhealthy";
    this.info.health = "unhealthy";
  }

  /** Mark a run as completed. */
  completeRun(runId: string): void {
    const run = this.activeRuns.get(runId);
    if (!run) return;

    this.activeRuns.delete(runId);
    this.completedRuns++;

    this.emitEvent({
      type: "run:completed",
      payload: {
        runtimeId: this.info.id,
        runId,
        durationMs: Date.now() - new Date(run.startedAt).getTime(),
        timestamp: new Date().toISOString(),
      },
    });
  }

  protected handleRunFailed(runId: string, error: string): void {
    const run = this.activeRuns.get(runId);
    if (!run) return;

    this.activeRuns.delete(runId);
    this.failedRuns++;

    this.emitEvent({
      type: "run:failed",
      payload: {
        runtimeId: this.info.id,
        runId,
        error,
        durationMs: Date.now() - new Date(run.startedAt).getTime(),
        timestamp: new Date().toISOString(),
      },
    });
  }

  protected emitEvent(event: RuntimeEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  /**
   * Create a Hono router with common RuntimeProtocol endpoints.
   * Subclasses should call `super.createRouter()` and add custom routes.
   */
  createRouter(): Hono {
    const app = new Hono();
    app.use("/*", cors());

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

    app.get("/runtime/status", async (c) => {
      const status = await this.getStatus();
      return c.json(status);
    });

    app.get("/runtime/capabilities", async (c) => {
      const caps = this.getCapabilities();
      return c.json(caps);
    });

    app.post("/runtime/start-run", async (c) => {
      const body = await c.req.json<StartRunRequest>();
      const result = await this.startRun(body);
      return c.json(result);
    });

    app.post("/runtime/cancel-run", async (c) => {
      const body = await c.req.json<CancelRunRequest>();
      const result = await this.cancelRun(body);
      return c.json(result);
    });

    app.post("/runtime/shutdown", async (c) => {
      const body = await c.req.json<ShutdownResponse>();
      await this.shutdown(body);
      return c.json({
        status: "shutdown_initiated",
        timestamp: new Date().toISOString(),
      });
    });

    return app;
  }
}
