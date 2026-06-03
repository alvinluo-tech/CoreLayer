import type { Tool } from "ai";
import { toolRuntime } from "./index.js";
import { getRegistry } from "../tools/registry.js";

const MAX_TOOL_RESULT_CHARS = 4000;
const TRUNCATION_NOTICE = "\n\n[结果已截断——过长，已保留首尾摘要]";

/**
 * Soft-trim a tool result if it exceeds MAX_TOOL_RESULT_CHARS.
 * Preserves head (70%) + tail (30%) with a truncation notice.
 * JSON.stringify is applied first to handle structured data.
 */
export function trimToolResult(value: unknown): unknown {
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (!str || str.length <= MAX_TOOL_RESULT_CHARS) return value;

  const bodyBudget = MAX_TOOL_RESULT_CHARS - TRUNCATION_NOTICE.length;
  const headLen = Math.floor(bodyBudget * 0.7);
  const tailLen = bodyBudget - headLen;

  const head = str.slice(0, headLen);
  const tail = str.slice(-tailLen);
  return head + TRUNCATION_NOTICE + tail;
}

/**
 * Wrap Vercel AI SDK tools so their execute functions route through ToolRuntime.
 * This adds permission checks and audit logging to AI-driven tool calls.
 */
export function wrapToolsForAI(
  tools: Record<string, Tool>,
  conversationId?: string,
): Record<string, Tool> {
  const wrapped: Record<string, Tool> = {};

  for (const [name, toolDef] of Object.entries(tools)) {
    if ("execute" in toolDef && typeof toolDef.execute === "function") {
      wrapped[name] = {
        ...toolDef,
        execute: async (args: unknown) => {
          const toolId = resolveToolId(name);
          const { result } = await toolRuntime.execute(toolId, args, {
            caller: "ai",
            conversationId,
          });
          if (result.success) return trimToolResult(result.data);
          throw new Error(result.error ?? "Tool execution failed");
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
