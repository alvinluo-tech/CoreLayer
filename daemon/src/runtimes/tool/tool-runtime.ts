/**
 * Tool Runtime — manages tool registry, execution, and permission enforcement.
 *
 * This runtime wraps the existing runtime/application/execute-tool.ts and native-tools/registry.ts,
 * exposing them through the RuntimeProtocol HTTP endpoints.
 */

import type {
  RuntimeCapabilitiesResponse,
  StartRunRequest,
  StartRunResponse,
} from "@jarvis/runtime-protocol";
import { isApprovalRequiredResult } from "@jarvis/runtime-protocol";
import type { ToolResult } from "@jarvis/types";
import { BaseRuntime, BaseRuntimeConfig } from "../base-runtime.js";

export interface ToolRuntimeConfig extends BaseRuntimeConfig {
  /** Max concurrent tool executions */
  maxConcurrentExecutions?: number;
  /** Default execution timeout in ms */
  defaultTimeoutMs?: number;
}

/**
 * Tool Runtime implementation.
 */
export class ToolRuntime extends BaseRuntime {
  private maxConcurrentExecutions: number;

  constructor(config: ToolRuntimeConfig) {
    super({ ...config, kind: "tool" });
    this.maxConcurrentExecutions = config.maxConcurrentExecutions ?? 10;
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

  override async startRun(request: StartRunRequest): Promise<StartRunResponse> {
    if (this.activeRuns.size >= this.maxConcurrentExecutions) {
      return {
        runId: request.runId,
        status: "rejected",
        reason: "Max concurrent executions reached",
      };
    }
    return super.startRun(request);
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
    const { ToolExecutionService } = await import(
      "./application/execute-tool.js"
    );
    const runtime = new ToolExecutionService();
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

  /** Alias for base completeRun — used by tool-specific callers */
  completeExecution(executionId: string): void {
    this.completeRun(executionId);
  }

  override createRouter() {
    const app = super.createRouter();

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

    app.get("/tools/list", async (c) => {
      const tools = await this.listTools();
      return c.json({ tools });
    });

    return app;
  }
}

/**
 * Create a new Tool Runtime.
 */
export function createToolRuntime(config: ToolRuntimeConfig): ToolRuntime {
  return new ToolRuntime(config);
}
