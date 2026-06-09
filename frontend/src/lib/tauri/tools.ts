import { invoke } from '@tauri-apps/api/core';

export interface ToolInfo {
  id: string;
  appId: string;
  source: 'mcp' | 'native' | 'skill' | 'rest';
  name: string;
  title: string;
  description: string;
  risk: 'low' | 'medium' | 'high' | 'critical';
  permissions: string[];
  requiresConfirmation: boolean;
  inputSchema: Record<string, unknown>;
}

export async function listAllTools(): Promise<{
  tools: ToolInfo[];
  count: number;
  bySource: { native: number; mcp: number; skill: number; rest: number };
}> {
  return invoke('list_all_tools');
}

export async function getTool(toolId: string): Promise<ToolInfo> {
  return invoke('get_tool', { toolId });
}

export interface ToolCallLogEntry {
  id: string;
  toolId: string;
  toolName: string;
  appId: string | null;
  source: string;
  args: unknown | null;
  resultSuccess: boolean | null;
  resultData: unknown | null;
  resultError: string | null;
  risk: string | null;
  confirmedByUser: boolean | null;
  durationMs: number | null;
  conversationId: string | null;
  createdAt: string;
}

export async function getToolCallLogs(limit = 20): Promise<{ logs: ToolCallLogEntry[] }> {
  return invoke('get_tool_call_logs', { limit });
}
