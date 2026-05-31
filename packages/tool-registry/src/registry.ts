import type {
  JarvisTool,
  ToolSource,
  ToolFilter,
  RiskLevel,
  ToolCategory,
  ToolDisplayMode,
  MCPToolDefinition,
  MCPToolCallResult,
} from '@jarvis/types';

export class ToolRegistry {
  private tools: Map<string, JarvisTool> = new Map();

  registerTool(tool: JarvisTool): void {
    this.tools.set(tool.id, tool);
  }

  registerTools(tools: JarvisTool[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  unregisterTool(toolId: string): boolean {
    return this.tools.delete(toolId);
  }

  unregisterBySource(source: ToolSource): number {
    let count = 0;
    for (const [id, tool] of this.tools) {
      if (tool.source === source) {
        this.tools.delete(id);
        count++;
      }
    }
    return count;
  }

  getTool(toolId: string): JarvisTool | undefined {
    return this.tools.get(toolId);
  }

  getAllTools(): JarvisTool[] {
    return Array.from(this.tools.values());
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  filterTools(filter: ToolFilter): JarvisTool[] {
    return this.getAllTools().filter((tool) => {
      if (filter.appId && tool.appId !== filter.appId) return false;
      if (filter.source && tool.source !== filter.source) return false;
      if (filter.risk && tool.risk !== filter.risk) return false;
      if (filter.category && tool.category !== filter.category) return false;
      if (filter.search) {
        const q = filter.search.toLowerCase();
        const matches =
          tool.name.toLowerCase().includes(q) ||
          tool.title.toLowerCase().includes(q) ||
          tool.description.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }

  getToolsByApp(appId: string): JarvisTool[] {
    return this.filterTools({ appId });
  }

  getToolsBySource(source: ToolSource): JarvisTool[] {
    return this.filterTools({ source });
  }

  /**
   * Convert MCP tool definitions from a server into JarvisTools.
   * The execute function calls the provided callback.
   */
  static fromMCPTools(
    serverId: string,
    mcpTools: MCPToolDefinition[],
    callTool: (
      serverId: string,
      toolName: string,
      args: Record<string, unknown>
    ) => Promise<MCPToolCallResult>
  ): JarvisTool[] {
    return mcpTools.map((t) => ({
      id: `mcp:${serverId}:${t.name}`,
      appId: serverId,
      source: 'mcp' as const,
      name: t.name,
      title: t.name,
      description: t.description ?? '',
      inputSchema: (t.inputSchema ?? { type: 'object' }) as JarvisTool['inputSchema'],
      risk: 'medium' as RiskLevel,
      permissions: [],
      requiresConfirmation: false,
      timeoutMs: 30000,
      idempotent: false,
      cancellable: false,
      category: 'other' as ToolCategory,
      displayMode: 'card' as ToolDisplayMode,
      execute: async (args: unknown) => {
        const result = await callTool(serverId, t.name, args as Record<string, unknown>);
        if (result.isError) {
          return {
            success: false,
            error: result.content.map((c) => c.text ?? '').join('\n'),
          };
        }
        return {
          success: true,
          data:
            result.content.length === 1 && result.content[0].type === 'text'
              ? result.content[0].text
              : result.content,
        };
      },
    }));
  }

  get size(): number {
    return this.tools.size;
  }

  clear(): void {
    this.tools.clear();
  }
}
