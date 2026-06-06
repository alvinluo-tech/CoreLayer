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
  /** Execution mode: chat, voice, tick, scheduled, workflow */
  mode?: string;
  /** Source tool category: mcp, native, skill, rest */
  source?: string;
  /** Tool call ID for idempotent dedup */
  toolCallId?: string;
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
        // Check if the memory has expired
        if (memory.expiresAt !== null && memory.expiresAt < Date.now()) {
          // Memory expired — fall through to confirmation
        } else if (memory.decision === "auto") {
          const result = await tool.execute(args);
          return {
            result,
            confirmed: true,
            durationMs: Date.now() - startTime,
          };
        } else if (memory.decision === "deny") {
          return {
            result: { success: false, error: `Tool denied by saved permission: ${toolId}` },
            confirmed: false,
            durationMs: Date.now() - startTime,
          };
        }
      }
    }

    if (context.caller === "ai") {
      // Idempotency: if toolCallId provided and a pending approval exists, skip duplicate
      if (context.toolCallId && context.runId && permissionCheck.requiresConfirmation) {
        const { approvalRequests } = getRepositories();
        const existing = await approvalRequests.findByToolCallId(context.toolCallId);
        if (existing) {
          return {
            result: { success: false, error: `Duplicate tool call: ${context.toolCallId}` },
            confirmed: false,
            durationMs: Date.now() - startTime,
          };
        }
      }

      const pending = await this.permissionGuard.executeWithPendingConfirmation(tool, args, {
        waitForExternalResolution: permissionCheck.requiresConfirmation,
      });

      if (context.runId && permissionCheck.requiresConfirmation) {
        const { approvalRequests } = getRepositories();
        const expiresInMs = 5 * 60_000; // 5 minutes
        await approvalRequests.create({
          id: pending.confirmationId,
          runId: context.runId,
          toolId: tool.id,
          toolName: tool.name,
          args,
          risk: tool.risk,
          projectScope: !!context.projectId,
          mode: context.mode,
          source: context.source,
          preview: tool.description,
          toolCallId: context.toolCallId,
          expiresAt: Date.now() + expiresInMs,
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
