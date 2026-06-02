import { ToolRegistry as BaseToolRegistry } from "@jarvis/tool-registry";
import type { JarvisTool, ToolResult } from "@jarvis/types";
import type { Tool } from "ai";

/**
 * Global tool registry instance.
 * Uses @jarvis/tool-registry under the hood, with backward-compatible API.
 */
const registry = new BaseToolRegistry();

/**
 * Register a tool from Vercel AI SDK format.
 * Backward compatible with existing tool connectors.
 */
export function registerTool(name: string, toolDef: Tool): void {
  const jarvisTool: JarvisTool = {
    id: `native:${name}`,
    appId: "jarvis",
    source: "native",
    name,
    title: name,
    description: "description" in toolDef ? String(toolDef.description) : "",
    inputSchema: ("parameters" in toolDef ? toolDef.parameters : { type: "object" }) as JarvisTool["inputSchema"] as any,
    risk: "low",
    permissions: [],
    requiresConfirmation: false,
    execute: async (args: unknown) => {
      if ("execute" in toolDef && typeof toolDef.execute === "function") {
        try {
          const result = await (toolDef.execute as (args: unknown) => Promise<unknown>)(args);
          return { success: true, data: result } as ToolResult;
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err) } as ToolResult;
        }
      }
      return { success: false, error: "Tool has no execute function" } as ToolResult;
    },
  };
  registry.registerTool(jarvisTool);
}

/**
 * Register a JarvisTool directly.
 */
export function registerJarvisTool(tool: JarvisTool): void {
  registry.registerTool(tool);
}

export function getTool(name: string): Tool | undefined {
  const tool = registry.resolveTool(name) ?? registry.getTool(`native:${name}`);
  if (!tool) return undefined;

  // Return in Vercel AI SDK format for backward compatibility
  return {
    description: tool.description,
    parameters: tool.inputSchema,
    execute: tool.execute as Tool["execute"],
  } as unknown as Tool;
}

export function getJarvisTool(name: string): JarvisTool | undefined {
  return registry.resolveTool(name) ?? registry.getTool(`native:${name}`);
}

export function getAllTools(): Record<string, Tool> {
  const result: Record<string, Tool> = {};
  for (const tool of registry.getAllTools()) {
    result[tool.name] = {
      description: tool.description,
      parameters: tool.inputSchema,
      execute: tool.execute as Tool["execute"],
    } as unknown as Tool;
  }
  return result;
}

export function getAllJarvisTools(): JarvisTool[] {
  return registry.getAllTools();
}

export function getAllToolNames(): string[] {
  return registry.getToolNames();
}

export function getRegistry(): BaseToolRegistry {
  return registry;
}
