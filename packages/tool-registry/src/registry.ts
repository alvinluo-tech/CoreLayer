import type {
  JarvisTool,
  ToolSource,
  ToolFilter,
  RiskLevel,
  ToolCategory,
  ToolDisplayMode,
  MCPToolDefinition,
  MCPToolCallResult,
  MCPToolAnnotations,
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

  getToolByName(name: string): JarvisTool | undefined {
    for (const tool of this.tools.values()) {
      if (tool.name === name) return tool;
    }
    return undefined;
  }

  resolveTool(identifier: string): JarvisTool | undefined {
    return this.getTool(identifier) ?? this.getToolByName(identifier);
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
   * Reads MCP tool annotations to infer risk, category, and display mode.
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
    return mcpTools.map((t) => {
      const annotations = t.annotations;
      const risk = resolveMcpRisk(annotations);
      const category = validateCategory(annotations?.category);
      const displayMode = validateDisplayMode(annotations?.displayMode);
      // Sanitize tool name: dots are not valid in OpenAI-style function names
      const safeName = t.name.replace(/\./g, '_');

      return {
        id: `mcp:${serverId}:${t.name}`,
        appId: serverId,
        source: 'mcp' as const,
        name: safeName,
        title: t.name,
        description: t.description ?? '',
        inputSchema: (t.inputSchema ?? { type: 'object' }) as JarvisTool['inputSchema'],
        risk,
        permissions: [],
        requiresConfirmation: risk === 'high' || risk === 'critical',
        timeoutMs: 30000,
        idempotent: annotations?.idempotentHint ?? false,
        cancellable: false,
        category,
        displayMode,
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
      };
    });
  }

  get size(): number {
    return this.tools.size;
  }

  clear(): void {
    this.tools.clear();
  }
}

/**
 * Infer risk level from MCP tool annotations.
 * Priority: explicit risk annotation > hint inference > default medium.
 */
const VALID_RISKS: ReadonlySet<string> = new Set(['low', 'medium', 'high', 'critical']);

function resolveMcpRisk(annotations?: MCPToolAnnotations): RiskLevel {
  if (annotations?.risk && VALID_RISKS.has(annotations.risk)) return annotations.risk;
  if (annotations?.destructiveHint) return 'high';
  if (annotations?.readOnlyHint) return 'low';
  return 'medium';
}

const VALID_CATEGORIES: ReadonlySet<string> = new Set([
  'productivity',
  'communication',
  'system',
  'data',
  'media',
  'automation',
  'other',
]);
const VALID_DISPLAY_MODES: ReadonlySet<string> = new Set(['inline', 'card', 'silent', 'confirm']);

function validateCategory(value: unknown): ToolCategory {
  return typeof value === 'string' && VALID_CATEGORIES.has(value)
    ? (value as ToolCategory)
    : 'other';
}

function validateDisplayMode(value: unknown): ToolDisplayMode {
  return typeof value === 'string' && VALID_DISPLAY_MODES.has(value)
    ? (value as ToolDisplayMode)
    : 'card';
}
