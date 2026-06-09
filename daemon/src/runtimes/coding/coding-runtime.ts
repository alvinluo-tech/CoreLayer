/**
 * Coding Runtime — manages coding agent adapters (Claude Code, Codex).
 *
 * This runtime wraps the existing coding runtime modules,
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

export interface CodingRuntimeConfig extends CreateManagedRuntimeInput {
  /** Max concurrent coding runs */
  maxConcurrentRuns?: number;
  /** Default run timeout in ms */
  defaultTimeoutMs?: number;
}

interface ActiveCodingRun {
  id: string;
  adapterId: string;
  startedAt: string;
  abortController: AbortController;
}

/**
 * Coding Runtime implementation.
 */
export class CodingRuntime implements ManagedRuntime {
  private info: RuntimeInfo;
  private health: RuntimeHealth = "unknown";
  private activeRuns = new Map<string, ActiveCodingRun>();
  private completedRuns = 0;
  private failedRuns = 0;
  private startedAt: string | null = null;
  private eventListeners: Set<(event: RuntimeEvent) => void> = new Set();
  private maxConcurrentRuns: number;

  constructor(config: CodingRuntimeConfig) {
    this.info = {
      id: config.id,
      kind: "coding",
      version: config.version,
      protocolVersion: 1,
      health: "unknown",
      port: config.port,
      appDataPath: config.appDataPath,
      logPath: config.logPath,
      restartCount: 0,
    };
    this.maxConcurrentRuns = config.maxConcurrentRuns ?? 3;
  }

  getInfo(): RuntimeInfo {
    return { ...this.info };
  }

  async getStatus(): Promise<RuntimeStatus> {
    const uptime = this.startedAt
      ? Date.now() - new Date(this.startedAt).getTime()
      : 0;

    const firstRun = this.activeRuns.values().next();
    const activeRunId = !firstRun.done ? firstRun.value.id : undefined;

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

  getCapabilities(): RuntimeCapabilitiesResponse {
    return {
      capabilities: [
        "coding:create_run",
        "coding:cancel_run",
        "coding:stream_events",
        "coding:collect_artifacts",
        "coding:list_adapters",
      ],
      supportedEvents: [
        "run:started",
        "run:progress",
        "run:completed",
        "run:failed",
        "coding:output",
        "coding:artifact",
      ],
      maxConcurrentRuns: this.maxConcurrentRuns,
    };
  }

  async startRun(request: StartRunRequest): Promise<StartRunResponse> {
    if (this.activeRuns.size >= this.maxConcurrentRuns) {
      return {
        runId: request.runId,
        status: "rejected",
        reason: "Max concurrent coding runs reached",
      };
    }

    const abortController = new AbortController();
    const input = request.input as {
      adapterId?: string;
      task?: unknown;
    };

    this.activeRuns.set(request.runId, {
      id: request.runId,
      adapterId: input.adapterId ?? "claude-code",
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
    for (const [runId, run] of this.activeRuns) {
      run.abortController.abort();
      this.handleRunFailed(runId, "Runtime shutting down");
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
   * Create a coding run using the existing registry.
   */
  async createCodingRun(
    adapterId: string,
    task: {
      repoPath: string;
      taskPrompt: string;
      branchName?: string;
      timeoutMs?: number;
    },
  ): Promise<{ runId: string; status: string }> {
    const { createCodingRun } = await import("./registry.js");

    const result = await createCodingRun(adapterId, task);
    return {
      runId: result.runId,
      status: result.status,
    };
  }

  /**
   * List available coding adapters with their availability status.
   */
  async listAdapters(): Promise<Array<{ id: string; name: string; available: boolean }>> {
    const { listCodingRuntimes, getCodingRuntime } = await import("./registry.js");

    const basics = listCodingRuntimes();
    const results = await Promise.all(
      basics.map(async (b) => {
        const adapter = getCodingRuntime(b.id);
        const availability = adapter ? await adapter.discover() : { available: false };
        return { id: b.id, name: b.name, available: availability.available };
      }),
    );

    return results;
  }

  /**
   * Collect artifacts from a coding run.
   */
  async collectArtifacts(
    adapterId: string,
    runId: string,
  ): Promise<Array<{ type: string; content: string }>> {
    const { collectCodingArtifacts } = await import("./registry.js");

    const artifacts = await collectCodingArtifacts(adapterId, runId);
    return artifacts.map((a) => ({
      type: a.type,
      content: a.content,
    }));
  }

  /**
   * Mark a run as completed.
   */
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

  private handleRunFailed(runId: string, error: string): void {
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

    // POST /coding/start
    app.post("/coding/start", async (c) => {
      const body = await c.req.json<{
        adapterId: string;
        task: {
          repoPath: string;
          taskPrompt: string;
          branchName?: string;
          timeoutMs?: number;
        };
      }>();
      const result = await this.createCodingRun(body.adapterId, body.task);
      return c.json(result);
    });

    // GET /coding/adapters
    app.get("/coding/adapters", async (c) => {
      const adapters = await this.listAdapters();
      return c.json({ adapters });
    });

    // GET /coding/:adapterId/:runId/artifacts
    app.get("/coding/:adapterId/:runId/artifacts", async (c) => {
      const adapterId = c.req.param("adapterId");
      const runId = c.req.param("runId");
      const artifacts = await this.collectArtifacts(adapterId, runId);
      return c.json({ artifacts });
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
        kind: "coding",
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * Create a new Coding Runtime.
 */
export function createCodingRuntime(
  config: CodingRuntimeConfig,
): CodingRuntime {
  return new CodingRuntime(config);
}
