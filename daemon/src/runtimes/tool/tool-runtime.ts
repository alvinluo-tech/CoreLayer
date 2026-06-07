/**
 * Tool Runtime — manages tool registry, execution, and permission enforcement.
 *
 * This runtime wraps the existing runtime/application/execute-tool.ts and native-tools/registry.ts,
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
import { isApprovalRequiredResult } from "@jarvis/runtime-protocol";
import type { ToolResult } from "@jarvis/types";
import { Hono } from "hono";
import { cors } from "hono/cors";

export interface ToolRuntimeConfig extends CreateManagedRuntimeInput {
  /** Max concurrent tool executions */
  maxConcurrentExecutions?: number;
  /** Default execution timeout in ms */
  defaultTimeoutMs?: number;
}

interface ActiveExecution {
  id: string;
  toolId: string;
  startedAt: string;
  abortController: AbortController;
}

/**
 * Tool Runtime implementation.
 */
export class ToolRuntime implements ManagedRuntime {
  private info: RuntimeInfo;
  private health: RuntimeHealth = "unknown";
  private activeExecutions = new Map<string, ActiveExecution>();
  private completedExecutions = 0;
  private failedExecutions = 0;
  private startedAt: string | null = null;
  private eventListeners: Set<(event: RuntimeEvent) => void> = new Set();
  private maxConcurrentExecutions: number;

  constructor(config: ToolRuntimeConfig) {
    this.info = {
      id: config.id,
      kind: "tool",
      version: config.version,
      protocolVersion: 1,
      health: "unknown",
      port: config.port,
      appDataPath: config.appDataPath,
      logPath: config.logPath,
      restartCount: 0,
    };
    this.maxConcurrentExecutions = config.maxConcurrentExecutions ?? 10;
  }

  getInfo(): RuntimeInfo {
    return { ...this.info };
  }

  async getStatus(): Promise<RuntimeStatus> {
    const uptime = this.startedAt
      ? Date.now() - new Date(this.startedAt).getTime()
      : 0;

    const firstExecution = this.activeExecutions.values().next();
    const activeRunId = !firstExecution.done
      ? firstExecution.value.id
      : undefined;

    return {
      ...this.info,
      health: this.health,
      activeRun: this.activeExecutions.size > 0,
      activeRunId,
      completedRuns: this.completedExecutions,
      failedRuns: this.failedExecutions,
      uptime,
    };
  }

  getCapabilities(): RuntimeCapabilitiesResponse {
    return {
      capabilities: [
        "tool:execute",
        "tool:list",
        "tool:register",
        "tool:validate",
        "permission:check",
        "permission:approve",
      ],
      supportedEvents: [
        "tool:executing",
        "tool:completed",
        "tool:failed",
        "permission:requested",
        "permission:approved",
        "permission:denied",
      ],
      maxConcurrentRuns: this.maxConcurrentExecutions,
    };
  }

  async startRun(request: StartRunRequest): Promise<StartRunResponse> {
    if (this.activeExecutions.size >= this.maxConcurrentExecutions) {
      return {
        runId: request.runId,
        status: "rejected",
        reason: "Max concurrent executions reached",
      };
    }

    const abortController = new AbortController();
    this.activeExecutions.set(request.runId, {
      id: request.runId,
      toolId: (request.input as { toolId?: string })?.toolId ?? "unknown",
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
    const execution = this.activeExecutions.get(request.runId);
    if (!execution) {
      return { runId: request.runId, status: "not_found" };
    }

    execution.abortController.abort();
    this.handleExecutionFailed(
      request.runId,
      request.reason ?? "Cancelled by user",
    );

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
    for (const [execId, execution] of this.activeExecutions) {
      execution.abortController.abort();
      this.handleExecutionFailed(execId, "Runtime shutting down");
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
   * Execute a tool through the existing ToolRuntime.
   */
  async executeTool(
    toolId: string,
    args: unknown,
    context: {
      caller: string;
      conversationId?: string;
      runId?: string;
      projectId?: string;
      mode?: string;
    },
  ): Promise<ToolResult> {
    const { ToolRuntime: ExistingToolRuntime } = await import(
      "./application/execute-tool.js"
    );

    const runtime = new ExistingToolRuntime();
    const result = await runtime.execute(toolId, args, {
      caller: context.caller,
      conversationId: context.conversationId,
      runId: context.runId,
      projectId: context.projectId,
      mode: context.mode,
    });

    if (isApprovalRequiredResult(result)) {
      return { success: false, error: `Approval required: ${result.approvalRequestId}` };
    }

    return result.result;
  }

  /**
   * List all available tools.
   */
  async listTools(): Promise<
    Array<{ id: string; name: string; description: string; risk: string }>
  > {
    const { getRegistry } = await import("./adapters/native-tools/registry.js");
    const registry = getRegistry();
    const tools = registry.getAllTools();

    return tools.map((tool) => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      risk: tool.risk,
    }));
  }

  /**
   * Mark an execution as completed.
   */
  completeExecution(executionId: string): void {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) return;

    this.activeExecutions.delete(executionId);
    this.completedExecutions++;

    this.emitEvent({
      type: "run:completed",
      payload: {
        runtimeId: this.info.id,
        runId: executionId,
        durationMs:
          Date.now() - new Date(execution.startedAt).getTime(),
        timestamp: new Date().toISOString(),
      },
    });
  }

  private handleExecutionFailed(executionId: string, error: string): void {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) return;

    this.activeExecutions.delete(executionId);
    this.failedExecutions++;

    this.emitEvent({
      type: "run:failed",
      payload: {
        runtimeId: this.info.id,
        runId: executionId,
        error,
        durationMs:
          Date.now() - new Date(execution.startedAt).getTime(),
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

    // POST /tools/execute
    app.post("/tools/execute", async (c) => {
      const body = await c.req.json<{
        toolId: string;
        args: unknown;
        context?: {
          caller: string;
          conversationId?: string;
          runId?: string;
          projectId?: string;
          mode?: string;
        };
      }>();
      const result = await this.executeTool(
        body.toolId,
        body.args,
        body.context ?? { caller: "rest-api" },
      );
      return c.json(result);
    });

    // GET /tools/list
    app.get("/tools/list", async (c) => {
      const tools = await this.listTools();
      return c.json({ tools });
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
        kind: "tool",
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * Create a new Tool Runtime.
 */
export function createToolRuntime(config: ToolRuntimeConfig): ToolRuntime {
  return new ToolRuntime(config);
}
