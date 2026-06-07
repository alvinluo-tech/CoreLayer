/**
 * Computer Control Runtime — manages direct OS interactions.
 *
 * This runtime wraps the existing computer-control/ modules,
 * exposing them through the RuntimeProtocol HTTP endpoints.
 * All operations go through OSCapabilityBroker for permission checks.
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

export interface ComputerControlRuntimeConfig
  extends CreateManagedRuntimeInput {
  /** Enable screen capture by default */
  screenCaptureEnabled?: boolean;
}

interface ActiveControlRun {
  id: string;
  operation: string;
  startedAt: string;
  abortController: AbortController;
}

/**
 * Computer Control Runtime implementation.
 */
export class ComputerControlRuntime implements ManagedRuntime {
  private info: RuntimeInfo;
  private health: RuntimeHealth = "unknown";
  private activeRuns = new Map<string, ActiveControlRun>();
  private completedRuns = 0;
  private failedRuns = 0;
  private startedAt: string | null = null;
  private eventListeners: Set<(event: RuntimeEvent) => void> = new Set();

  constructor(config: ComputerControlRuntimeConfig) {
    this.info = {
      id: config.id,
      kind: "computer-control",
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
        "computer:screenshot",
        "computer:window_list",
        "computer:window_focus",
        "computer:window_close",
        "computer:click",
        "computer:double_click",
        "computer:right_click",
        "computer:type_text",
        "computer:key_press",
        "computer:key_combo",
        "computer:scroll",
        "computer:drag",
        "computer:clipboard_read",
        "computer:clipboard_write",
      ],
      supportedEvents: [
        "run:started",
        "run:completed",
        "run:failed",
        "computer:screenshot_captured",
        "computer:permission_changed",
      ],
      maxConcurrentRuns: 1,
    };
  }

  async startRun(request: StartRunRequest): Promise<StartRunResponse> {
    if (this.activeRuns.size >= 1) {
      return {
        runId: request.runId,
        status: "rejected",
        reason: "Computer control operation already in progress",
      };
    }

    const abortController = new AbortController();
    const input = request.input as { operation?: string };

    this.activeRuns.set(request.runId, {
      id: request.runId,
      operation: input.operation ?? "unknown",
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
   * Request a computer control operation through the existing runtime.
   */
  async requestControl(request: {
    actorId: string;
    agentRunId?: string;
    taskId?: string;
    projectId?: string;
    operation: string;
    coordinates?: { x: number; y: number };
    endCoordinates?: { x: number; y: number };
    text?: string;
    key?: string;
    keys?: string[];
    scrollDelta?: { x: number; y: number };
    windowId?: string;
    fileFilters?: string[];
    reason?: string;
  }): Promise<unknown> {
    const { requestComputerControl } = await import(
      "../../computer-control/computer-control-runtime.js"
    );

    return requestComputerControl(
      request as Parameters<typeof requestComputerControl>[0],
    );
  }

  /**
   * Take a screenshot.
   */
  async screenshot(actorId: string): Promise<unknown> {
    return this.requestControl({
      actorId,
      operation: "screenshot",
      reason: "Screenshot requested",
    });
  }

  /**
   * List available windows.
   */
  async listWindows(actorId: string): Promise<unknown> {
    return this.requestControl({
      actorId,
      operation: "window.list",
      reason: "List windows",
    });
  }

  /**
   * Focus a window.
   */
  async focusWindow(actorId: string, windowId: string): Promise<unknown> {
    return this.requestControl({
      actorId,
      operation: "window.focus",
      windowId,
      reason: "Focus window",
    });
  }

  /**
   * Click at coordinates.
   */
  async click(
    actorId: string,
    coordinates: { x: number; y: number },
  ): Promise<unknown> {
    return this.requestControl({
      actorId,
      operation: "click",
      coordinates,
      reason: "Click",
    });
  }

  /**
   * Type text.
   */
  async typeText(actorId: string, text: string): Promise<unknown> {
    return this.requestControl({
      actorId,
      operation: "type_text",
      text,
      reason: "Type text",
    });
  }

  /**
   * Read clipboard.
   */
  async clipboardRead(): Promise<unknown> {
    const { getCapabilityBroker } = await import(
      "../../capability/os-capability-broker.js"
    );
    const broker = getCapabilityBroker();
    const decision = await broker.requestCapability({
      actorId: "system",
      capability: "window.control",
      resource: "clipboard:read",
      riskLevel: "medium",
      proposedAction: "read",
      reason: "Read clipboard",
    });
    return { decision: decision.decision };
  }

  /**
   * Write to clipboard.
   */
  async clipboardWrite(actorId: string, text: string): Promise<unknown> {
    const { getCapabilityBroker } = await import(
      "../../capability/os-capability-broker.js"
    );
    const broker = getCapabilityBroker();
    const decision = await broker.requestCapability({
      actorId,
      capability: "window.control",
      resource: "clipboard:write",
      riskLevel: "high",
      proposedAction: "write",
      reason: "Write to clipboard",
    });
    return { decision: decision.decision, text };
  }

  /**
   * Get permission statuses.
   */
  async getPermissionStatuses(): Promise<unknown> {
    const { getPermissionStatuses } = await import(
      "../../computer-control/computer-control-runtime.js"
    );
    return getPermissionStatuses();
  }

  /**
   * Get the full computer control status.
   */
  async getControlStatus(): Promise<unknown> {
    const { getComputerControlStatus } = await import(
      "../../computer-control/computer-control-runtime.js"
    );
    return getComputerControlStatus();
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

    // POST /computer/control — generic control endpoint
    app.post("/computer/control", async (c) => {
      const body = await c.req.json<{
        actorId: string;
        agentRunId?: string;
        taskId?: string;
        projectId?: string;
        operation: string;
        coordinates?: { x: number; y: number };
        endCoordinates?: { x: number; y: number };
        text?: string;
        key?: string;
        keys?: string[];
        scrollDelta?: { x: number; y: number };
        windowId?: string;
        fileFilters?: string[];
        reason?: string;
      }>();
      const result = await this.requestControl(body);
      return c.json(result);
    });

    // POST /computer/screenshot
    app.post("/computer/screenshot", async (c) => {
      const body = await c.req.json<{ actorId: string }>();
      const result = await this.screenshot(body.actorId);
      return c.json(result);
    });

    // GET /computer/windows
    app.get("/computer/windows", async (c) => {
      const actorId = c.req.query("actorId") ?? "system";
      const result = await this.listWindows(actorId);
      return c.json(result);
    });

    // POST /computer/window/focus
    app.post("/computer/window/focus", async (c) => {
      const body = await c.req.json<{
        actorId: string;
        windowId: string;
      }>();
      const result = await this.focusWindow(body.actorId, body.windowId);
      return c.json(result);
    });

    // POST /computer/input/click
    app.post("/computer/input/click", async (c) => {
      const body = await c.req.json<{
        actorId: string;
        coordinates: { x: number; y: number };
      }>();
      const result = await this.click(body.actorId, body.coordinates);
      return c.json(result);
    });

    // POST /computer/input/type
    app.post("/computer/input/type", async (c) => {
      const body = await c.req.json<{
        actorId: string;
        text: string;
      }>();
      const result = await this.typeText(body.actorId, body.text);
      return c.json(result);
    });

    // GET /computer/clipboard/read
    app.get("/computer/clipboard/read", async (c) => {
      const result = await this.clipboardRead();
      return c.json(result);
    });

    // POST /computer/clipboard/write
    app.post("/computer/clipboard/write", async (c) => {
      const body = await c.req.json<{
        actorId: string;
        text: string;
      }>();
      const result = await this.clipboardWrite(body.actorId, body.text);
      return c.json(result);
    });

    // GET /computer/permissions
    app.get("/computer/permissions", async (c) => {
      const statuses = await this.getPermissionStatuses();
      return c.json(statuses);
    });

    // GET /computer/status
    app.get("/computer/status", async (c) => {
      const status = await this.getControlStatus();
      return c.json(status);
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
        kind: "computer-control",
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * Create a new Computer Control Runtime.
 */
export function createComputerControlRuntime(
  config: ComputerControlRuntimeConfig,
): ComputerControlRuntime {
  return new ComputerControlRuntime(config);
}
