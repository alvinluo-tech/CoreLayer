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
 *
 * For high-risk tools (Phase 4):
 * - Creates an approval_requests DB record
 * - Checks permission_memories for auto-decision
 * - Falls back to in-memory pending confirmation
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

    // Check permission memory for auto-decision (Phase 4)
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
          // User previously said "always allow" — execute directly
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
        // "confirm" — fall through to normal confirmation flow
      }
    }

    // For AI-driven calls, use executeWithPendingConfirmation
    // so high-risk tools create a pending confirmation that the UI can resolve
    if (context.caller === "ai") {
      const pending = await this.permissionGuard.executeWithPendingConfirmation(tool, args);

      // Create approval request in DB (Phase 4)
      if (context.runId && permissionCheck.requiresConfirmation) {
        const { approvalRequests } = getRepositories();
        await approvalRequests.create({
          runId: context.runId,
          toolId: tool.id,
          toolName: tool.name,
          args,
          risk: tool.risk,
          projectScope: !!context.projectId,
        });
      }

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
