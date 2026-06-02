import { create } from 'zustand';
import {
  listMCPServers,
  connectMCPServer as tauriConnectMCPServer,
  disconnectMCPServer as tauriDisconnectMCPServer,
  updateMCPServer as tauriUpdateMCPServer,
  listAllTools,
  type MCPServerInfo,
  type ToolInfo,
} from '@/lib/tauri';

interface MCPState {
  servers: MCPServerInfo[];
  tools: ToolInfo[];
  toolCounts: { native: number; mcp: number; skill: number; rest: number };
  isLoading: boolean;
  error: string | null;

  fetchServers: () => Promise<void>;
  fetchTools: () => Promise<void>;
  connectServer: (config: {
    id: string;
    name: string;
    transport: 'http' | 'stdio' | 'sse';
    url?: string;
  }) => Promise<void>;
  disconnectServer: (serverId: string) => Promise<void>;
  updateServer: (
    serverId: string,
    config: { name: string; transport: 'http' | 'stdio' | 'sse'; url?: string }
  ) => Promise<void>;
}

export const useMCPStore = create<MCPState>((set, get) => ({
  servers: [],
  tools: [],
  toolCounts: { native: 0, mcp: 0, skill: 0, rest: 0 },
  isLoading: false,
  error: null,

  fetchServers: async () => {
    set({ isLoading: true, error: null });
    try {
      const resp = await listMCPServers();
      set({ servers: resp.servers, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  fetchTools: async () => {
    set({ isLoading: true, error: null });
    try {
      const resp = await listAllTools();
      set({
        tools: resp.tools,
        toolCounts: resp.bySource,
        isLoading: false,
      });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  connectServer: async (config) => {
    set({ isLoading: true, error: null });
    try {
      await tauriConnectMCPServer({
        ...config,
        enabled: true,
      });
      await get().fetchServers();
      await get().fetchTools();
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  disconnectServer: async (serverId) => {
    set({ isLoading: true, error: null });
    try {
      await tauriDisconnectMCPServer(serverId);
      await get().fetchServers();
      await get().fetchTools();
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  updateServer: async (serverId, config) => {
    set({ isLoading: true, error: null });
    try {
      await tauriUpdateMCPServer(serverId, { ...config, enabled: true });
      await get().fetchServers();
      await get().fetchTools();
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },
}));
