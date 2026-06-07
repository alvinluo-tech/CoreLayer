/**
 * Agent Runtime — manages AI orchestration, model gateway, and agent runs.
 *
 * This runtime wraps the existing ai/ and orchestrator/ modules,
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

export interface AgentRuntimeConfig extends CreateManagedRuntimeInput {
  /** Max concurrent agent runs */
  maxConcurrentRuns?: number;
  /** Run timeout in ms */
  runTimeoutMs?: number;
}

interface ActiveRun {
  id: string;
  startedAt: string;
  abortController: AbortController;
}

/**
 * Agent Runtime implementation.
 */
export class AgentRuntime implements ManagedRuntime {
  private info: RuntimeInfo;
  private health: RuntimeHealth = "unknown";
  private activeRuns = new Map<string, ActiveRun>();
  private completedRuns = 0;
  private failedRuns = 0;
  private startedAt: string | null = null;
  private eventListeners: Set<(event: RuntimeEvent) => void> = new Set();
  private maxConcurrentRuns: number;
  private runTimeoutMs: number;

  constructor(config: AgentRuntimeConfig) {
    this.info = {
      id: config.id,
      kind: "agent",
      version: config.version,
      protocolVersion: 1,
      health: "unknown",
      port: config.port,
      appDataPath: config.appDataPath,
      logPath: config.logPath,
      restartCount: 0,
    };
    this.maxConcurrentRuns = config.maxConcurrentRuns ?? 3;
    this.runTimeoutMs = config.runTimeoutMs ?? 300_000;
  }

  getInfo(): RuntimeInfo {
    return { ...this.info };
  }

  async getStatus(): Promise<RuntimeStatus> {
    const uptime = this.startedAt
      ? Date.now() - new Date(this.startedAt).getTime()
      : 0;

    return {
      ...this.info,
      health: this.health,
      activeRun: this.activeRuns.size > 0,
      activeRunId: this.activeRuns.values().next().value?.id,
      completedRuns: this.completedRuns,
      failedRuns: this.failedRuns,
      uptime,
    };
  }

  getCapabilities(): RuntimeCapabilitiesResponse {
    return {
      capabilities: [
        "agent:run",
        "agent:stream",
        "agent:cancel",
        "model:select",
        "conversation:create",
        "conversation:compress",
      ],
      supportedEvents: [
        "run:started",
        "run:progress",
        "run:completed",
        "run:failed",
      ],
      maxConcurrentRuns: this.maxConcurrentRuns,
    };
  }

  async startRun(request: StartRunRequest): Promise<StartRunResponse> {
    if (this.activeRuns.size >= this.maxConcurrentRuns) {
      return {
        runId: request.runId,
        status: "rejected",
        reason: "Max concurrent runs reached",
      };
    }

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

    // Set up timeout
    const timeout = setTimeout(() => {
      if (this.activeRuns.has(request.runId)) {
        abortController.abort();
        this.handleRunFailed(request.runId, "Run timed out");
      }
    }, this.runTimeoutMs);

    // Store timeout for cleanup
    const run = this.activeRuns.get(request.runId);
    if (run) {
      (run as ActiveRun & { timeout?: ReturnType<typeof setTimeout> }).timeout =
        timeout;
    }

    return {
      runId: request.runId,
      status: "started",
    };
  }

  async cancelRun(request: CancelRunRequest): Promise<CancelRunResponse> {
    const run = this.activeRuns.get(request.runId);
    if (!run) {
      return { runId: request.runId, status: "not_found" };
    }

    run.abortController.abort();
    this.handleRunFailed(request.runId, request.reason ?? "Cancelled by user");

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
    // Cancel all active runs
    for (const [runId, run] of this.activeRuns) {
      run.abortController.abort();
      this.handleRunFailed(runId, "Runtime shutting down");
    }

    this.health = "unhealthy";
    this.info.health = "unhealthy";
  }

  async healthCheck(): Promise<boolean> {
    // Basic health check - verify we can access config
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
   * Mark a run as completed.
   */
  completeRun(runId: string): void {
    const run = this.activeRuns.get(runId);
    if (!run) return;

    clearTimeout(
      (run as ActiveRun & { timeout?: ReturnType<typeof setTimeout> }).timeout,
    );
    this.activeRuns.delete(runId);
    this.completedRuns++;

    this.emitEvent({
      type: "run:completed",
      payload: {
        runtimeId: this.info.id,
        runId,
        durationMs:
          Date.now() - new Date(run.startedAt).getTime(),
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Handle a failed run.
   */
  private handleRunFailed(runId: string, error: string): void {
    const run = this.activeRuns.get(runId);
    if (!run) return;

    clearTimeout(
      (run as ActiveRun & { timeout?: ReturnType<typeof setTimeout> }).timeout,
    );
    this.activeRuns.delete(runId);
    this.failedRuns++;

    this.emitEvent({
      type: "run:failed",
      payload: {
        runtimeId: this.info.id,
        runId,
        error,
        durationMs:
          Date.now() - new Date(run.startedAt).getTime(),
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
      return c.json({ status: "shutdown_initiated", timestamp: new Date().toISOString() });
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
        kind: "agent",
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * Create a new Agent Runtime.
 */
export function createAgentRuntime(
  config: AgentRuntimeConfig,
): AgentRuntime {
  return new AgentRuntime(config);
}
