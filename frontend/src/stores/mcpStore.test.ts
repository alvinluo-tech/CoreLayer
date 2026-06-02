import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockListMCPServers = vi.fn();
const mockConnectMCPServer = vi.fn();
const mockDisconnectMCPServer = vi.fn();
const mockListAllTools = vi.fn();

vi.mock('@/lib/tauri', () => ({
  listMCPServers: (...args: unknown[]) => mockListMCPServers(...args),
  connectMCPServer: (...args: unknown[]) => mockConnectMCPServer(...args),
  disconnectMCPServer: (...args: unknown[]) => mockDisconnectMCPServer(...args),
  listAllTools: (...args: unknown[]) => mockListAllTools(...args),
}));

import { useMCPStore } from './mcpStore';

const mockServer = {
  config: {
    id: 'srv-1',
    name: 'Test Server',
    transport: 'http',
    url: 'http://localhost:3000',
    enabled: true,
  },
  status: 'connected' as const,
  tools: [{ name: 'tool1', description: 'A tool' }],
  resources: [],
  prompts: [],
};

const mockTools = {
  tools: [
    {
      id: 'tool-1',
      appId: 'srv-1',
      source: 'mcp' as const,
      name: 'tool1',
      title: 'Tool 1',
      description: 'A tool',
      risk: 'low' as const,
      permissions: [],
      requiresConfirmation: false,
      inputSchema: {},
    },
  ],
  count: 1,
  bySource: { native: 0, mcp: 1, skill: 0, rest: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  useMCPStore.setState({
    servers: [],
    tools: [],
    toolCounts: { native: 0, mcp: 0, skill: 0, rest: 0 },
    isLoading: false,
    error: null,
  });
});

describe('useMCPStore', () => {
  describe('fetchServers', () => {
    it('populates servers on success', async () => {
      mockListMCPServers.mockResolvedValueOnce({ servers: [mockServer] });

      await useMCPStore.getState().fetchServers();

      const state = useMCPStore.getState();
      expect(state.servers).toEqual([mockServer]);
      expect(state.isLoading).toBe(false);
    });

    it('sets error on failure', async () => {
      mockListMCPServers.mockRejectedValueOnce(new Error('fetch failed'));

      await useMCPStore.getState().fetchServers();

      expect(useMCPStore.getState().error).toBe('Error: fetch failed');
      expect(useMCPStore.getState().isLoading).toBe(false);
    });
  });

  describe('fetchTools', () => {
    it('populates tools and toolCounts on success', async () => {
      mockListAllTools.mockResolvedValueOnce(mockTools);

      await useMCPStore.getState().fetchTools();

      const state = useMCPStore.getState();
      expect(state.tools).toEqual(mockTools.tools);
      expect(state.toolCounts).toEqual({ native: 0, mcp: 1, skill: 0, rest: 0 });
      expect(state.isLoading).toBe(false);
    });
  });

  describe('connectServer', () => {
    it('connects and cascading refreshes servers + tools', async () => {
      mockConnectMCPServer.mockResolvedValueOnce({ success: true, server: mockServer });
      mockListMCPServers.mockResolvedValueOnce({ servers: [mockServer] });
      mockListAllTools.mockResolvedValueOnce(mockTools);

      await useMCPStore.getState().connectServer({
        id: 'srv-1',
        name: 'Test Server',
        transport: 'http',
        url: 'http://localhost:3000',
      });

      expect(mockConnectMCPServer).toHaveBeenCalledWith({
        id: 'srv-1',
        name: 'Test Server',
        transport: 'http',
        url: 'http://localhost:3000',
        enabled: true,
      });
      expect(mockListMCPServers).toHaveBeenCalled();
      expect(mockListAllTools).toHaveBeenCalled();

      const state = useMCPStore.getState();
      expect(state.servers).toEqual([mockServer]);
      expect(state.tools).toEqual(mockTools.tools);
    });

    it('throws on failure without cascading', async () => {
      mockConnectMCPServer.mockRejectedValueOnce(new Error('connect failed'));

      await expect(
        useMCPStore.getState().connectServer({
          id: 'srv-1',
          name: 'Test Server',
          transport: 'http',
        })
      ).rejects.toThrow('connect failed');

      expect(mockListMCPServers).not.toHaveBeenCalled();
      expect(mockListAllTools).not.toHaveBeenCalled();
    });
  });

  describe('disconnectServer', () => {
    it('disconnects and cascading refreshes servers + tools', async () => {
      useMCPStore.setState({ servers: [mockServer], tools: mockTools.tools });
      mockDisconnectMCPServer.mockResolvedValueOnce({ success: true });
      mockListMCPServers.mockResolvedValueOnce({ servers: [] });
      mockListAllTools.mockResolvedValueOnce({
        tools: [],
        count: 0,
        bySource: { native: 0, mcp: 0, skill: 0, rest: 0 },
      });

      await useMCPStore.getState().disconnectServer('srv-1');

      expect(mockDisconnectMCPServer).toHaveBeenCalledWith('srv-1');
      expect(mockListMCPServers).toHaveBeenCalled();
      expect(mockListAllTools).toHaveBeenCalled();

      const state = useMCPStore.getState();
      expect(state.servers).toEqual([]);
      expect(state.tools).toEqual([]);
    });

    it('sets error on failure without cascading', async () => {
      mockDisconnectMCPServer.mockRejectedValueOnce(new Error('disconnect failed'));

      await useMCPStore.getState().disconnectServer('srv-1');

      expect(useMCPStore.getState().error).toBe('Error: disconnect failed');
      expect(mockListMCPServers).not.toHaveBeenCalled();
      expect(mockListAllTools).not.toHaveBeenCalled();
    });
  });
});
