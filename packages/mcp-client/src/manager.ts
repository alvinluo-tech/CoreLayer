import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type {
  MCPServerConfig,
  MCPServerInfo,
  MCPServerStatus,
  MCPToolDefinition,
  MCPResourceDefinition,
  MCPPromptDefinition,
  MCPToolCallResult,
} from '@jarvis/types';

export interface MCPServerConnection {
  config: MCPServerConfig;
  client: Client;
  status: MCPServerStatus;
  tools: MCPToolDefinition[];
  resources: MCPResourceDefinition[];
  prompts: MCPPromptDefinition[];
  lastConnected?: Date;
  lastError?: string;
}

export class MCPClientManager {
  private connections: Map<string, MCPServerConnection> = new Map();

  async connectServer(config: MCPServerConfig): Promise<MCPServerConnection> {
    const existing = this.connections.get(config.id);
    if (existing?.status === 'connected') {
      return existing;
    }

    const connection: MCPServerConnection = {
      config,
      client: new Client({ name: 'jarvis', version: '0.1.0' }, { capabilities: {} }),
      status: 'connecting',
      tools: [],
      resources: [],
      prompts: [],
    };

    this.connections.set(config.id, connection);

    try {
      if (config.transport === 'http' || config.transport === 'sse') {
        if (!config.url) {
          throw new Error(`MCP server ${config.id}: URL required for HTTP/SSE transport`);
        }
        const url = new URL(config.url);
        const transport = new SSEClientTransport(url);
        await connection.client.connect(transport);
      } else if (config.transport === 'stdio') {
        throw new Error('stdio transport not yet implemented in browser context');
      }

      connection.status = 'connected';
      connection.lastConnected = new Date();

      await this.discoverCapabilities(connection);
    } catch (error) {
      connection.status = 'error';
      connection.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }

    return connection;
  }

  async disconnectServer(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    if (!connection) return;

    try {
      await connection.client.close();
    } catch {
      // ignore close errors
    }

    connection.status = 'disconnected';
    this.connections.delete(serverId);
  }

  async disconnectAll(): Promise<void> {
    const serverIds = Array.from(this.connections.keys());
    await Promise.all(serverIds.map((id) => this.disconnectServer(id)));
  }

  getConnection(serverId: string): MCPServerConnection | undefined {
    return this.connections.get(serverId);
  }

  getAllConnections(): MCPServerConnection[] {
    return Array.from(this.connections.values());
  }

  getConnectedServers(): MCPServerConnection[] {
    return Array.from(this.connections.values()).filter((c) => c.status === 'connected');
  }

  getAllTools(): MCPToolDefinition[] {
    return this.getConnectedServers().flatMap((c) => c.tools);
  }

  getAllResources(): MCPResourceDefinition[] {
    return this.getConnectedServers().flatMap((c) => c.resources);
  }

  getAllPrompts(): MCPPromptDefinition[] {
    return this.getConnectedServers().flatMap((c) => c.prompts);
  }

  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MCPToolCallResult> {
    const connection = this.connections.get(serverId);
    if (!connection || connection.status !== 'connected') {
      throw new Error(`MCP server ${serverId} not connected`);
    }

    const result = await connection.client.callTool({
      name: toolName,
      arguments: args,
    });

    return result as MCPToolCallResult;
  }

  async readResource(serverId: string, uri: string): Promise<unknown> {
    const connection = this.connections.get(serverId);
    if (!connection || connection.status !== 'connected') {
      throw new Error(`MCP server ${serverId} not connected`);
    }

    const result = await connection.client.readResource({ uri });
    return result;
  }

  async getPrompt(
    serverId: string,
    promptName: string,
    args?: Record<string, string>
  ): Promise<unknown> {
    const connection = this.connections.get(serverId);
    if (!connection || connection.status !== 'connected') {
      throw new Error(`MCP server ${serverId} not connected`);
    }

    const result = await connection.client.getPrompt({
      name: promptName,
      arguments: args,
    });
    return result;
  }

  getServerInfo(serverId: string): MCPServerInfo | undefined {
    const connection = this.connections.get(serverId);
    if (!connection) return undefined;

    return {
      config: connection.config,
      status: connection.status,
      tools: connection.tools,
      resources: connection.resources,
      prompts: connection.prompts,
      lastConnected: connection.lastConnected?.toISOString(),
      lastError: connection.lastError,
    };
  }

  getAllServerInfo(): MCPServerInfo[] {
    return Array.from(this.connections.keys())
      .map((id) => this.getServerInfo(id)!)
      .filter(Boolean);
  }

  private async discoverCapabilities(connection: MCPServerConnection): Promise<void> {
    try {
      const toolsResult = await connection.client.listTools();
      connection.tools = toolsResult.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as Record<string, unknown> | undefined,
        annotations: t.annotations as import('@jarvis/types').MCPToolAnnotations | undefined,
      }));
    } catch {
      // Server may not support tools
    }

    try {
      const resourcesResult = await connection.client.listResources();
      connection.resources = resourcesResult.resources.map((r) => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType as string | undefined,
      }));
    } catch {
      // Server may not support resources
    }

    try {
      const promptsResult = await connection.client.listPrompts();
      connection.prompts = promptsResult.prompts.map((p) => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments?.map((a) => ({
          name: a.name,
          description: a.description,
          required: a.required,
        })),
      }));
    } catch {
      // Server may not support prompts
    }
  }
}
