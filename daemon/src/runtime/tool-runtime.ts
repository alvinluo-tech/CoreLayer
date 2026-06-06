import { PermissionGuard } from "@jarvis/permission-guard";
import type { ToolResult } from "@jarvis/types";
import { getRegistry } from "../tools/registry.js";
import { getRepositories } from "../db/factory.js";

export interface ToolExecutionContext {
  /** Who initiated the call: "ai", "skill", "rest-api", "user" */
  caller: string;
  /** Conversation ID if called from AI orchestrator */
  conversationId?: string;
  /** Skill name if called from skill executor */
  skillName?: string;
  /** Project ID for project-scoped permission memory */
  projectId?: string;
  /** Run ID for DB-backed approval requests */
  runId?: string;
}

export interface ToolExecutionResult {
  result: ToolResult;
  confirmed: boolean;
  durationMs: number;
}

/**
 * Single execution entry point for all tool calls.
 * Enforces permission checks, audit logging, and timeout.
 */
export class ToolRuntime {
  private permissionGuard: PermissionGuard;

  constructor(permissionGuard?: PermissionGuard) {
    this.permissionGuard = permissionGuard ?? new PermissionGuard();
  }

  async execute(
    toolId: string,
    args: unknown,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const registry = getRegistry();
    const tool = registry.resolveTool(toolId) ?? registry.getTool(`native:${toolId}`);
    if (!tool) {
      return {
        result: { success: false, error: `Tool not found: ${toolId}` },
        confirmed: false,
        durationMs: 0,
      };
    }

    const startTime = Date.now();
    const permissionCheck = this.permissionGuard.checkPermission(tool);

    if (permissionCheck.requiresConfirmation && context.runId) {
      const { permissionMemories } = getRepositories();
      const memory = await permissionMemories.find(
        toolId,
        "default",
        context.projectId,
      );
      if (memory) {
        if (memory.decision === "auto") {
          const result = await tool.execute(args);
          return {
            result,
            confirmed: true,
            durationMs: Date.now() - startTime,
          };
        }
        if (memory.decision === "deny") {
          return {
            result: { success: false, error: `Tool denied by saved permission: ${toolId}` },
            confirmed: false,
            durationMs: Date.now() - startTime,
          };
        }
      }
    }

    if (context.caller === "ai") {
      const pending = await this.permissionGuard.executeWithPendingConfirmation(tool, args, {
        waitForExternalResolution: permissionCheck.requiresConfirmation,
      });

      if (context.runId && permissionCheck.requiresConfirmation) {
        const { approvalRequests } = getRepositories();
        await approvalRequests.create({
          id: pending.confirmationId,
          runId: context.runId,
          toolId: tool.id,
          toolName: tool.name,
          args,
          risk: tool.risk,
          projectScope: !!context.projectId,
        });
      }

      const result = await pending.confirm();
      return {
        result,
        confirmed: permissionCheck.requiresConfirmation && result.success,
        durationMs: Date.now() - startTime,
      };
    }

    const { result, confirmed } = await this.permissionGuard.executeWithGuard(tool, args);
    return {
      result,
      confirmed,
      durationMs: Date.now() - startTime,
    };
  }

  getPermissionGuard(): PermissionGuard {
    return this.permissionGuard;
  }
}
