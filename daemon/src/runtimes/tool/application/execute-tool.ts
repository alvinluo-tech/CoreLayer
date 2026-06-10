import { PermissionGuard } from "@jarvis/permission-guard";
import type { ToolResult, JSONSchema } from "@jarvis/types";
import type { ApprovalRequiredResult } from "@jarvis/runtime-protocol";
import { getRegistry } from "../adapters/native-tools/registry.js";
import { getRepositories } from "../../../persistence/factory.js";

/**
 * Basic validation of tool args against the tool's inputSchema.
 * Returns null if valid, or an error message string if invalid.
 */
function validateToolArgs(args: unknown, schema: JSONSchema | undefined): string | null {
  if (!schema) return null;
  if (typeof args !== "object" || args === null) {
    return schema.type === "object" ? "Expected an object argument" : null;
  }
  const obj = args as Record<string, unknown>;
  if (Array.isArray(schema.required)) {
    for (const field of schema.required) {
      if (!(field in obj)) {
        return `Missing required field: ${field}`;
      }
    }
  }
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in obj && propSchema.type) {
        const val = obj[key];
        if (propSchema.type === "string" && typeof val !== "string") {
          return `Field '${key}' should be a string`;
        }
        if (propSchema.type === "number" && typeof val !== "number") {
          return `Field '${key}' should be a number`;
        }
        if (propSchema.type === "boolean" && typeof val !== "boolean") {
          return `Field '${key}' should be a boolean`;
        }
        if (propSchema.type === "array" && !Array.isArray(val)) {
          return `Field '${key}' should be an array`;
        }
      }
    }
  }
  return null;
}

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

export type ToolExecuteReturn = ToolExecutionResult | ApprovalRequiredResult;

/**
 * Single execution entry point for all tool calls.
 * Enforces permission checks, audit logging, and timeout.
 */
/**
 * Voice mode has a more conservative permission policy:
 * - write/delete/execute tools -> confirmation required
 * - external API side effects -> confirmation required
 * - local read-only queries -> allow with notification
 */
function adjustPermissionForMode(
  requiresConfirmation: boolean,
  mode: string | undefined,
  action: string | undefined,
): boolean {
  if (mode !== "voice") return requiresConfirmation;
  // Voice mode: read-only actions are auto-allowed, everything else requires confirmation
  if (action === "read") return false;
  return true;
}

export class ToolExecutionService {
  private permissionGuard: PermissionGuard;
  /** Track consecutive deleteConversation calls per run to detect batch intent */
  private deleteCountByRun = new Map<string, number>();

  constructor(permissionGuard?: PermissionGuard) {
    this.permissionGuard = permissionGuard ?? new PermissionGuard();
  }

  /** Write a tool execution result to the persistent audit log */
  private async persistAuditEntry(
    tool: { id: string; name: string; risk: string },
    _args: unknown,
    result: "success" | "failure" | "denied" | "cancelled",
    context: ToolExecutionContext,
    opts?: { confirmedByUser?: boolean; error?: string },
  ): Promise<void> {
    try {
      const { auditLog } = getRepositories();
      await auditLog.create({
        actor: context.caller,
        action: "tool.execute",
        resource: `tool:${tool.name}`,
        riskLevel: tool.risk,
        permissionDecision: result === "denied" ? "deny" : "allow",
        confirmedByUser: opts?.confirmedByUser ?? false,
        result,
        metadata: {
          toolId: tool.id,
          toolName: tool.name,
          conversationId: context.conversationId,
          runId: context.runId,
          projectId: context.projectId,
          error: opts?.error,
        },
      });
    } catch {
      // Best-effort — don't fail tool execution
    }
  }

  async execute(
    toolId: string,
    args: unknown,
    context: ToolExecutionContext,
  ): Promise<ToolExecuteReturn> {
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

    // Gate: validate args before any execution or approval flow
    const validationError = validateToolArgs(args, tool.inputSchema);
    if (validationError) {
      return {
        result: { success: false, error: `Validation failed: ${validationError}` },
        confirmed: false,
        durationMs: Date.now() - startTime,
      };
    }

    // Safety: detect multiple sequential deleteConversation calls and redirect to batch tool
    if (toolId === "deleteConversation" || toolId === "native:deleteConversation") {
      const runKey = context.runId ?? "__global__";
      const count = (this.deleteCountByRun.get(runKey) ?? 0) + 1;
      this.deleteCountByRun.set(runKey, count);
      if (count >= 2) {
        return {
          result: {
            success: false,
            error: "检测到批量删除意图。请使用 requestConversationCleanup 工具进行批量清理，而不是多次调用 deleteConversation。",
          },
          confirmed: false,
          durationMs: Date.now() - startTime,
        };
      }
    } else {
      // Reset counter for non-delete tools
      if (context.runId) {
        this.deleteCountByRun.delete(context.runId);
      }
    }

    const permissionCheck = this.permissionGuard.checkPermission(tool);
    const effectiveRequiresConfirmation = adjustPermissionForMode(
      permissionCheck.requiresConfirmation,
      context.mode,
      (tool as { action?: string }).action,
    );

    if (effectiveRequiresConfirmation && context.runId) {
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
          // Log auto-allowed decision for audit trail
          if (context.runId) {
            const { approvalRequests } = getRepositories();
            await approvalRequests.create({
              runId: context.runId,
              toolId: tool.id,
              toolName: tool.name,
              args,
              risk: tool.risk,
              projectScope: !!context.projectId,
              mode: context.mode,
              source: context.source,
              preview: `[auto-allowed] ${tool.description}`,
              toolCallId: context.toolCallId,
            }).then((r) => approvalRequests.approve(r.id)).catch(() => { /* best-effort */ });
          }
          const result = await tool.execute(args);
          this.persistAuditEntry(tool, args, result.success ? "success" : "failure", context, { confirmedByUser: true, error: result.error });
          return {
            result,
            confirmed: true,
            durationMs: Date.now() - startTime,
          };
        } else if (memory.decision === "deny") {
          this.persistAuditEntry(tool, args, "denied", context);
          return {
            result: { success: false, error: `Tool denied by saved permission: ${toolId}` },
            confirmed: false,
            durationMs: Date.now() - startTime,
          };
        }
      }
    }

    if (context.caller === "ai") {
      // Non-blocking approval: return ApprovalRequiredResult immediately
      if (effectiveRequiresConfirmation && context.runId) {
        // Idempotency: if toolCallId provided and a pending approval exists, skip duplicate
        if (context.toolCallId) {
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

        const { approvalRequests } = getRepositories();
        const expiresInMs = 5 * 60_000; // 5 minutes
        const approvalRequest = await approvalRequests.create({
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
          operationKind: "tool.execute",
          operationPayload: { args },
        });

        return {
          kind: "approval_required",
          approvalRequestId: approvalRequest.id,
          runId: context.runId,
          toolCallId: context.toolCallId ?? null,
          toolId: tool.id,
          toolName: tool.name,
          operationKind: "tool.execute",
          operationPayload: { args },
          actor: context.caller,
          mode: context.mode ?? "chat",
          projectId: context.projectId ?? null,
          taskId: null,
          conversationId: context.conversationId ?? null,
          source: context.source ?? null,
          preview: tool.description ?? null,
          risk: tool.risk,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
        };
      }

      // No confirmation needed — execute immediately
      const result = await tool.execute(args);
      this.persistAuditEntry(tool, args, result.success ? "success" : "failure", context, { confirmedByUser: false, error: result.error });
      return {
        result,
        confirmed: false,
        durationMs: Date.now() - startTime,
      };
    }

    const { result, confirmed } = await this.permissionGuard.executeWithGuard(tool, args);
    this.persistAuditEntry(tool, args, result.success ? "success" : "failure", context, { confirmedByUser: confirmed, error: result.error });
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

/** Module-level singleton for tool execution (permission guard, audit, etc.) */
export const toolRuntime = new ToolExecutionService();
