import { PermissionGuard } from "@jarvis/permission-guard";
import type { ToolResult } from "@jarvis/types";
import { getRegistry } from "../tools/registry.js";

export interface ToolExecutionContext {
  /** Who initiated the call: "ai", "skill", "rest-api", "user" */
  caller: string;
  /** Conversation ID if called from AI orchestrator */
  conversationId?: string;
  /** Skill name if called from skill executor */
  skillName?: string;
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
    const tool = registry.getTool(toolId) ?? registry.getTool(`native:${toolId}`);
    if (!tool) {
      return {
        result: { success: false, error: `Tool not found: ${toolId}` },
        confirmed: false,
        durationMs: 0,
      };
    }

    const startTime = Date.now();

    // For AI-driven calls, use executeWithPendingConfirmation
    // so high-risk tools create a pending confirmation that the UI can resolve
    if (context.caller === "ai") {
      const pending = await this.permissionGuard.executeWithPendingConfirmation(tool, args);

      // Low/medium risk: already auto-executed by executeWithPendingConfirmation
      // The confirm() call returns the result immediately
      const result = await pending.confirm();
      return {
        result,
        confirmed: false,
        durationMs: Date.now() - startTime,
      };
    }

    // For non-AI callers (skill, rest-api), use executeWithGuard directly
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
