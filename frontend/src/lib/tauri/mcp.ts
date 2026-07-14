import { invoke } from '@tauri-apps/api/core';

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

export interface MCPRiskPolicy {
  low: 'auto' | 'notify' | 'confirm';
  medium: 'auto' | 'notify' | 'confirm';
  high: 'auto' | 'notify' | 'confirm';
  critical: 'auto' | 'notify' | 'confirm' | 'deny';
}

export interface MCPServerInfo {
  config: {
    id: string;
    name: string;
    transport: string;
    url?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    auth?: MCPAuthConfig;
    enabled: boolean;
    permissions?: MCPPermissions;
    riskPolicy?: MCPRiskPolicy;
  };
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  tools: { name: string; description?: string }[];
  resources: { uri: string; name: string; description?: string }[];
  prompts: { name: string; description?: string }[];
  lastConnected?: string;
  lastError?: string;
}

export async function listMCPServers(): Promise<{ servers: MCPServerInfo[] }> {
  return invoke('list_mcp_servers');
}

export async function connectMCPServer(config: {
  id: string;
  name: string;
  transport: 'http' | 'stdio' | 'sse';
  url?: string;
  command?: string;
  auth?: MCPAuthConfig;
  enabled: boolean;
}): Promise<{ success: boolean; server?: MCPServerInfo; error?: string }> {
  return invoke('connect_mcp_server', { config });
}

export async function disconnectMCPServer(
  serverId: string
): Promise<{ success: boolean; error?: string }> {
  return invoke('disconnect_mcp_server', { serverId });
}

export async function updateMCPServer(
  serverId: string,
  config: {
    name: string;
    transport: 'http' | 'stdio' | 'sse';
    url?: string;
    command?: string;
    auth?: MCPAuthConfig;
    enabled: boolean;
  }
): Promise<{ success: boolean; server?: MCPServerInfo; error?: string }> {
  return invoke('update_mcp_server', { serverId, config });
}

export async function listMCPTools(): Promise<{
  tools: { name: string; description?: string }[];
  count: number;
}> {
  return invoke('list_mcp_tools');
}

export async function listMCPResources(): Promise<{
  resources: { uri: string; name: string }[];
  count: number;
}> {
  return invoke('list_mcp_resources');
}

export async function listMCPPrompts(): Promise<{
  prompts: { name: string; description?: string }[];
  count: number;
}> {
  return invoke('list_mcp_prompts');
}
