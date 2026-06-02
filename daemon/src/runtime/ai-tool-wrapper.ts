import type { Tool } from "ai";
import { toolRuntime } from "./index.js";
import { getRegistry } from "../tools/registry.js";

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
          if (result.success) return result.data;
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
