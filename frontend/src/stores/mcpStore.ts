import { create } from "zustand";
import {
  listMCPServers,
  connectMCPServer as tauriConnectMCPServer,
  disconnectMCPServer as tauriDisconnectMCPServer,
  listAllTools,
  listModelProfiles,
  type MCPServerInfo,
  type ToolInfo,
  type ModelProfile,
} from "@/lib/tauri";

interface MCPState {
  servers: MCPServerInfo[];
  tools: ToolInfo[];
  toolCounts: { native: number; mcp: number; skill: number; rest: number };
  modelProfiles: ModelProfile[];
  isLoading: boolean;
  error: string | null;

  fetchServers: () => Promise<void>;
  fetchTools: () => Promise<void>;
  fetchModelProfiles: () => Promise<void>;
  connectServer: (config: {
    id: string;
    name: string;
    transport: "http" | "stdio" | "sse";
    url?: string;
  }) => Promise<void>;
  disconnectServer: (serverId: string) => Promise<void>;
}

export const useMCPStore = create<MCPState>((set, get) => ({
  servers: [],
  tools: [],
  toolCounts: { native: 0, mcp: 0, skill: 0, rest: 0 },
  modelProfiles: [],
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

  fetchModelProfiles: async () => {
    set({ isLoading: true, error: null });
    try {
      const resp = await listModelProfiles();
      set({ modelProfiles: resp.profiles, isLoading: false });
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
      set({ error: String(e), isLoading: false });
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
}));
