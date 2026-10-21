import type { Tool } from "ai";
import { isApprovalRequiredResult } from "@jarvis/runtime-protocol";
import { toolRuntime } from "../public-api.js";
import { getRegistry } from "./native-tools/registry.js";
import { resolveToolCallId, withToolInvocationContext } from "../domain/tool-call-id.js";
import { saveSpill, SPILL_THRESHOLD_CHARS } from "../domain/spill-store.js";

/**
 * Runtime context passed through to ToolRuntime for every AI tool call.
 * Ensures runId, mode, and scope are available for approval and audit.
 */
export interface AIToolRuntimeContext {
  runId?: string;
  conversationId?: string;
  workspaceId?: string;
  projectId?: string;
  taskId?: string;
  agentId?: string;
  mode?: "chat" | "voice" | "tick" | "scheduled" | "workflow" | "regenerate";
  onApprovalRequired?: (approvalRequestId: string) => void;
}

const TRUNCATION_NOTICE = "\n\n[结果已截断——过长，已保留首尾摘要]";

/**
 * Marker prefix for tool results that require user approval.
 * The agent loop detects this in onStepFinish and suspends the run.
 */
export const APPROVAL_REQUIRED_PREFIX = "__APPROVAL_REQUIRED__:";

export function isApprovalRequiredMarker(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(APPROVAL_REQUIRED_PREFIX);
}

export function extractApprovalRequestIds(value: unknown): string[] {
  if (!isApprovalRequiredMarker(value)) return [];
  const payload = (value as string).slice(APPROVAL_REQUIRED_PREFIX.length);
  try {
    const parsed = JSON.parse(payload) as { ids: string[] };
    return parsed.ids ?? [];
  } catch {
    return [];
  }
}

/**
 * Trim a tool result that exceeds SPILL_THRESHOLD_CHARS.
 *
 * Preferred path: spill the full text to disk (SpillStore) and return a
 * structured handle — total size, on-disk locator, head/tail preview, and a
 * retrieval hint — so oversized output stays fully inspectable.
 *
 * Fallback path: if the disk write fails, degrade to the lossy 70/30
 * head/tail truncation instead of failing the agent turn.
 * JSON.stringify is applied first to handle structured data.
 */
export function trimToolResult(
  value: unknown,
  context?: { sessionId?: string; toolName?: string; callId?: string },
): unknown {
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (!str || str.length <= SPILL_THRESHOLD_CHARS) return value;

  try {
    const spill = saveSpill(str, context);
    return (
      `[Tool Output Spilled]\n` +
      `Total Size: ${spill.bytes} bytes (${spill.chars} characters).\n` +
      `Full Content Saved To: ${spill.locator}\n\n` +
      `Preview:\n${spill.preview}\n\n` +
      `Hint: ${spill.retrievalHint}`
    );
  } catch {
    const bodyBudget = SPILL_THRESHOLD_CHARS - TRUNCATION_NOTICE.length;
    const headLen = Math.floor(bodyBudget * 0.7);
    const tailLen = bodyBudget - headLen;
    return str.slice(0, headLen) + TRUNCATION_NOTICE + str.slice(-tailLen);
  }
}

/**
 * Wrap Vercel AI SDK tools so their execute functions route through ToolRuntime.
 * This adds permission checks and audit logging to AI-driven tool calls.
 *
 * When a context with runId is provided, high-risk tools will create
 * approval_requests rows in the DB for the Approval Inbox.
 *
 * When approval is required, returns a special marker string instead of throwing.
 * The agent loop detects this marker in onStepFinish and suspends the run.
 */
export function wrapToolsForAI(
  tools: Record<string, Tool>,
  context?: AIToolRuntimeContext | string,
): Record<string, Tool> {
  // Backward compat: if called with a plain string, treat as conversationId
  const ctx: AIToolRuntimeContext =
    typeof context === "string" ? { conversationId: context } : (context ?? {});

  const wrapped: Record<string, Tool> = {};

  for (const [name, toolDef] of Object.entries(tools)) {
    if ("execute" in toolDef && typeof toolDef.execute === "function") {
      wrapped[name] = {
        ...toolDef,
        execute: async (args: unknown) => {
          const toolId = resolveToolId(name);
          const toolCallId = resolveToolCallId(undefined, ctx.runId, toolId, args);
          // Any tool that needs to know which run invoked it reads this, rather
          // than taking a runId argument the model would have to supply.
          const executeResult = await withToolInvocationContext(ctx.runId, () =>
            toolRuntime.execute(toolId, args, {
              caller: "ai",
              runId: ctx.runId,
              conversationId: ctx.conversationId,
              projectId: ctx.projectId,
              mode: ctx.mode,
              toolCallId,
              onApprovalRequired: ctx.onApprovalRequired,
            }),
          );
          if (isApprovalRequiredResult(executeResult)) {
            // Return a marker instead of throwing — the agent loop detects this
            // in onStepFinish and suspends the run.
            return `${APPROVAL_REQUIRED_PREFIX}${JSON.stringify({ ids: [executeResult.approvalRequestId] })}`;
          }
          if (executeResult.result.success) {
            return trimToolResult(executeResult.result.data, {
              sessionId: ctx.conversationId ?? ctx.runId,
              toolName: name,
              callId: toolCallId,
            });
          }
          throw new Error(executeResult.result.error ?? "Tool execution failed");
        },
      } as Tool;
    } else {
      wrapped[name] = toolDef;
    }
  }

  return wrapped;
}

/**
 * Resolve a tool name (as used by Vercel AI SDK) to its full registry ID.
 */
function resolveToolId(name: string): string {
  const registry = getRegistry();
  const tool = registry.getTool(name) ?? registry.getTool(`native:${name}`);
  return tool?.id ?? name;
}
