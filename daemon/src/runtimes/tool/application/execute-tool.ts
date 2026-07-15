import { PermissionGuard } from "@jarvis/permission-guard";
import type { ToolResult, JSONSchema, JarvisTool } from "@jarvis/types";
import type { ApprovalRequiredResult } from "@jarvis/runtime-protocol";
import { getRegistry } from "../adapters/native-tools/registry.js";
import { getRepositories } from "../../../persistence/factory.js";
import { checkHardlineBlocklist } from "../../../capabilities/hardline-blocklist.js";
import { canAutoApprove } from "../../../capabilities/capability-policy.js";
import type { OperationRisk } from "../../../operations/domain/operation.js";

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
  /** Tool policy mode: standard, guide_only, disable_all */
  toolPolicyMode?: string;
  /** Callback triggered when a tool execution is suspended awaiting approval */
  onApprovalRequired?: (approvalRequestId: string) => void;
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
  private deleteCountByRun = new Map<string, { count: number; timestamp: number }>();

  constructor(permissionGuard?: PermissionGuard) {
    this.permissionGuard = permissionGuard ?? new PermissionGuard();
  }

  /** Evict stale entries from deleteCountByRun (entries older than 10 minutes) */
  private cleanupStaleDeleteCounts(): void {
    const now = Date.now();
    const TEN_MINUTES = 600_000;
    for (const [key, entry] of this.deleteCountByRun) {
      if (now - entry.timestamp > TEN_MINUTES) {
        this.deleteCountByRun.delete(key);
      }
    }
  }

  /** Check for batch deletion intent. Returns an error result if detected, null otherwise. */
  private checkBatchDeletion(
    toolId: string,
    context: ToolExecutionContext,
  ): ToolExecutionResult | null {
    if (toolId !== "deleteConversation" && toolId !== "native:deleteConversation") {
      if (context.runId) {
        this.deleteCountByRun.delete(context.runId);
      }
      return null;
    }
    const runKey = context.runId ?? "__global__";
    const entry = this.deleteCountByRun.get(runKey);
    const count = (entry?.count ?? 0) + 1;
    this.deleteCountByRun.set(runKey, { count, timestamp: Date.now() });
    if (count >= 2) {
      return {
        result: {
          success: false,
          error: "检测到批量删除意图。请使用 requestConversationCleanup 工具进行批量清理，而不是多次调用 deleteConversation。",
        },
        confirmed: false,
        durationMs: 0,
      };
    }
    return null;
  }

  /**
   * Check saved permission memory for auto-approve/deny.
   * Returns the execution result if memory applies, null if confirmation is needed.
   */
  private async checkPermissionMemory(
    tool: JarvisTool,
    args: unknown,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult | null> {
    const permissionCheck = this.permissionGuard.checkPermission(tool);
    const effectiveRequiresConfirmation = adjustPermissionForMode(
      permissionCheck.requiresConfirmation,
      context.mode,
      (tool as { action?: string }).action,
    );
    if (!effectiveRequiresConfirmation || !context.runId) return null;

    const { permissionMemories } = getRepositories();
    const memory = await permissionMemories.find(
      tool.id,
      "default",
      context.projectId,
      context.runId,
    );
    if (!memory) return null;

    if (memory.expiresAt !== null && memory.expiresAt < Date.now()) {
      return null; // expired — fall through to confirmation
    }
    if (memory.decision === "auto" && !canAutoApprove(tool.risk as OperationRisk)) {
      return null; // high/critical risk cannot be auto-approved
    }
    if (memory.decision === "auto") {
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
        durationMs: 0,
      };
    }
    if (memory.decision === "deny") {
      this.persistAuditEntry(tool, args, "denied", context);
      return {
        result: { success: false, error: `Tool denied by saved permission: ${tool.id}` },
        confirmed: false,
        durationMs: 0,
      };
    }
    return null;
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

    // Hardline blocklist: unconditionally deny dangerous operations
    const toolCategory = (tool as { category?: string }).category ?? toolId.split(":")[0];
    const command = typeof args === "object" && args !== null
      ? String((args as Record<string, unknown>).command ?? (args as Record<string, unknown>).query ?? JSON.stringify(args))
      : String(args);
    const blocklistResult = checkHardlineBlocklist(command, toolCategory);
    if (blocklistResult.blocked) {
      // Audit the blocked attempt
      this.persistAuditEntry(tool, args, "denied", context, {
        error: `Hardline blocklist: ${blocklistResult.rule.reason}`,
      });
      return {
        result: { success: false, error: `已阻止: ${blocklistResult.rule.reason}` },
        confirmed: false,
        durationMs: Date.now() - startTime,
      };
    }

    // Safety: detect multiple sequential deleteConversation calls and redirect to batch tool
    this.cleanupStaleDeleteCounts();
    const batchBlock = this.checkBatchDeletion(toolId, context);
    if (batchBlock) return { ...batchBlock, durationMs: Date.now() - startTime };

    // Tool policy: check guide_only / disable_all modes
    if (context.toolPolicyMode && context.toolPolicyMode !== "standard") {
      const { checkToolPolicy } = await import("../../../capabilities/tool-policy.js");
      const { parseToolPolicyMode } = await import("../../../capabilities/tool-policy.js");
      const policyMode = parseToolPolicyMode(context.toolPolicyMode);
      const policyResult = checkToolPolicy(tool, policyMode);
      if (!policyResult.allowed) {
        this.persistAuditEntry(tool, args, "denied", context, { error: policyResult.guidance });
        return {
          result: { success: false, error: policyResult.guidance ?? "Tool disabled by policy" },
          confirmed: false,
          durationMs: Date.now() - startTime,
        };
      }
      // Guide mode: add guidance to the result but allow execution
      if (policyResult.guidance && context.caller === "ai") {
        // Log the guidance for audit purposes
        this.persistAuditEntry(tool, args, "success", context, { confirmedByUser: false, error: `[guide_only] ${policyResult.guidance}` });
      }
    }

    // Check saved permission memory for auto-approve/deny
    const memoryResult = await this.checkPermissionMemory(tool, args, context);
    if (memoryResult) return { ...memoryResult, durationMs: Date.now() - startTime };

    // Smart approval: LLM evaluates risk when mode is "smart"
    if (context.mode === "smart" && context.caller === "ai") {
      const { evaluateToolRisk } = await import("../../../capabilities/smart-approval.js");
      const smartResult = await evaluateToolRisk({
        toolName: tool.name,
        toolDescription: tool.description,
        toolRisk: tool.risk,
        args,
      });

      if (smartResult.decision === "auto") {
        // Smart auto-approve: execute immediately
        const result = await tool.execute(args);
        this.persistAuditEntry(tool, args, result.success ? "success" : "failure", context, { confirmedByUser: false, error: result.error });
        return {
          result,
          confirmed: false,
          durationMs: Date.now() - startTime,
        };
      }
      if (smartResult.decision === "deny") {
        this.persistAuditEntry(tool, args, "denied", context);
        return {
          result: { success: false, error: `Smart approval denied: ${smartResult.reason}` },
          confirmed: false,
          durationMs: Date.now() - startTime,
        };
      }
      // "confirm" falls through to the standard approval flow below
    }

    // Compute effective requiresConfirmation for downstream use
    const permissionCheck = this.permissionGuard.checkPermission(tool);
    const effectiveRequiresConfirmation = adjustPermissionForMode(
      permissionCheck.requiresConfirmation,
      context.mode,
      (tool as { action?: string }).action,
    );

    if (context.caller === "ai") {
      // Blocking approval: wait for user resolution inline
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

        // Notify client stream that approval is required
        if (context.onApprovalRequired) {
          context.onApprovalRequired(approvalRequest.id);
        }

        // Suspend the active thread waiting for user resolution
        const executionResult = await this.permissionGuard.executeWithPendingConfirmation(
          tool,
          args,
          { waitForExternalResolution: true, timeoutMs: expiresInMs }
        );

        const result = await executionResult.confirm();
        return {
          result,
          confirmed: result.success,
          durationMs: Date.now() - startTime,
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
