import { MCPClientManager } from "@jarvis/mcp-client";
import { ToolRegistry } from "@jarvis/tool-registry";
import type { MCPServerConfig } from "@jarvis/types";
import { getRegistry } from "../tools/registry.js";

let mcpManager: MCPClientManager | null = null;

export function getMCPManager(): MCPClientManager {
  if (!mcpManager) {
    mcpManager = new MCPClientManager();
  }
  return mcpManager;
}

export async function connectMCPServer(config: MCPServerConfig): Promise<void> {
  const manager = getMCPManager();
  const connection = await manager.connectServer(config);

  // Register MCP tools into the global tool registry
  const toolRegistry = getRegistry();
  const mcpTools = ToolRegistry.fromMCPTools(
    config.id,
    connection.tools,
    (serverId, toolName, args) => manager.callTool(serverId, toolName, args),
  );
  toolRegistry.registerTools(mcpTools);

  console.log(`[MCP] Connected to ${config.name}: ${connection.tools.length} tools, ${connection.resources.length} resources, ${connection.prompts.length} prompts`);
}

export async function disconnectMCPServer(serverId: string): Promise<void> {
  const manager = getMCPManager();
  const toolRegistry = getRegistry();

  // Remove MCP tools for this server
  const tools = toolRegistry.getToolsBySource("mcp");
  for (const tool of tools) {
    if (tool.appId === serverId) {
      toolRegistry.unregisterTool(tool.id);
    }
  }

  await manager.disconnectServer(serverId);
  console.log(`[MCP] Disconnected from ${serverId}`);
}

export async function disconnectAllMCPServers(): Promise<void> {
  try {
    const manager = getMCPManager();
    const toolRegistry = getRegistry();
    toolRegistry.unregisterBySource("mcp");
    await manager.disconnectAll();
  } catch (err) {
    console.error("[Jarvis][mcp/disconnectAll]", err instanceof Error ? err.message : err);
  }
}
