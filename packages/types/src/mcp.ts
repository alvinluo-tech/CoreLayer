export type MCPTransportType = 'http' | 'stdio' | 'sse';

export type MCPServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface MCPServerConfig {
  id: string;
  name: string;
  transport: MCPTransportType;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  auth?: MCPAuthConfig;
  enabled: boolean;
  permissions: MCPPermissions;
  riskPolicy: RiskPolicy;
}

export interface MCPAuthConfig {
  type: 'none' | 'bearer' | 'basic' | 'oauth';
  tokenRef?: string;
  username?: string;
  passwordRef?: string;
}

export interface MCPPermissions {
  read: boolean;
  write: boolean;
  delete: boolean;
  bulkWrite: boolean;
}

export interface RiskPolicy {
  low: 'auto' | 'notify' | 'confirm';
  medium: 'auto' | 'notify' | 'confirm';
  high: 'auto' | 'notify' | 'confirm';
  critical: 'auto' | 'notify' | 'confirm' | 'deny';
}

export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface MCPResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPromptDefinition {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface MCPServerInfo {
  config: MCPServerConfig;
  status: MCPServerStatus;
  tools: MCPToolDefinition[];
  resources: MCPResourceDefinition[];
  prompts: MCPPromptDefinition[];
  lastConnected?: string;
  lastError?: string;
}

export interface MCPToolCallResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}
