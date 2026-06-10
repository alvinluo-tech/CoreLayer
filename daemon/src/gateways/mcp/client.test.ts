import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * MCP Client tests.
 *
 * The module under test uses a singleton pattern for MCPClientManager:
 *   let mcpManager: MCPClientManager | null = null;
 *   export function getMCPManager() {
 *     if (!mcpManager) mcpManager = new MCPClientManager();
 *     return mcpManager;
 *   }
 *
 * This singleton persists across tests within the same file. To work around
 * this, we mock MCPClientManager to always return our mock manager instance
 * from the constructor, and rely on the singleton being the same reference
 * across tests (since vi.clearAllMocks only clears call history, not the
 * cached object).
 *
 * For getMCPManager tests, we just verify the singleton behavior.
 * For connect/disconnect tests, we set up mockManager's methods in beforeEach.
 */

const mockConnectServer = vi.fn();
const mockDisconnectServer = vi.fn();
const mockDisconnectAll = vi.fn();
const mockCallTool = vi.fn();

const mockManager = {
  connectServer: mockConnectServer,
  disconnectServer: mockDisconnectServer,
  disconnectAll: mockDisconnectAll,
  callTool: mockCallTool,
};

const mockRegisterTools = vi.fn();
const mockGetToolsBySource = vi.fn().mockReturnValue([]);
const mockUnregisterTool = vi.fn();
const mockUnregisterBySource = vi.fn();
const mockToolRegistry = {
  registerTools: mockRegisterTools,
  getToolsBySource: mockGetToolsBySource,
  unregisterTool: mockUnregisterTool,
  unregisterBySource: mockUnregisterBySource,
};

const mockFromMCPTools = vi.fn().mockReturnValue([]);
const mockLoadMCPServers = vi.fn();

vi.mock("@jarvis/mcp-client", () => ({
  MCPClientManager: vi.fn(() => mockManager),
}));

vi.mock("@jarvis/tool-registry", () => ({
  ToolRegistry: { fromMCPTools: (...args: unknown[]) => mockFromMCPTools(...args) },
}));

vi.mock("../../runtimes/tool/public-api.js", () => ({
  getRegistry: () => mockToolRegistry,
}));

vi.mock("../../config/mcp-config.js", () => ({
  loadMCPServers: (...args: unknown[]) => mockLoadMCPServers(...args),
}));

const {
  getMCPManager,
  connectMCPServer,
  disconnectMCPServer,
  disconnectAllMCPServers,
  autoConnectMCPServers,
} = await import("./client.js");

describe("MCP Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetToolsBySource.mockReturnValue([]);
    mockLoadMCPServers.mockReturnValue([]);
  });

  describe("getMCPManager", () => {
    it("returns a manager instance", () => {
      const m = getMCPManager();
      expect(m).toBeDefined();
      expect(m).toBe(mockManager);
    });

    it("returns the same instance on subsequent calls (singleton)", () => {
      const m1 = getMCPManager();
      const m2 = getMCPManager();
      expect(m1).toBe(m2);
    });
  });

  describe("connectMCPServer", () => {
    it("connects and registers tools", async () => {
      mockConnectServer.mockResolvedValue({
        tools: [{ id: "tool-1", name: "test-tool" }],
        resources: [],
        prompts: [],
      });

      const config = {
        id: "server-1",
        name: "Test Server",
        command: "npx",
        args: ["test-mcp"],
      };

      await connectMCPServer(config);

      expect(mockConnectServer).toHaveBeenCalledWith(config);
      expect(mockRegisterTools).toHaveBeenCalled();
    });

    it("logs connection info", async () => {
      mockConnectServer.mockResolvedValue({
        tools: [{ id: "tool-1" }, { id: "tool-2" }],
        resources: [{ id: "res-1" }],
        prompts: [{ id: "prompt-1" }],
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await connectMCPServer({
        id: "server-1",
        name: "Test Server",
        command: "npx",
        args: [],
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Connected to Test Server"),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("2 tools"),
      );
      consoleSpy.mockRestore();
    });

    it("passes MCP tools to ToolRegistry.fromMCPTools", async () => {
      mockConnectServer.mockResolvedValue({
        tools: [{ id: "t1", name: "tool1" }],
        resources: [],
        prompts: [],
      });

      await connectMCPServer({
        id: "server-1",
        name: "Test Server",
        command: "npx",
        args: [],
      });

      expect(mockFromMCPTools).toHaveBeenCalledWith(
        "server-1",
        [{ id: "t1", name: "tool1" }],
        expect.any(Function),
      );
    });

    it("propagates connection errors", async () => {
      mockConnectServer.mockRejectedValue(new Error("connection refused"));

      await expect(
        connectMCPServer({
          id: "server-1",
          name: "Test Server",
          command: "npx",
          args: [],
        }),
      ).rejects.toThrow("connection refused");
    });
  });

  describe("disconnectMCPServer", () => {
    it("removes tools and disconnects server", async () => {
      mockGetToolsBySource.mockReturnValue([
        { id: "mcp-tool-1", appId: "server-1" },
        { id: "mcp-tool-2", appId: "server-2" },
      ]);

      await disconnectMCPServer("server-1");

      expect(mockUnregisterTool).toHaveBeenCalledWith("mcp-tool-1");
      expect(mockUnregisterTool).not.toHaveBeenCalledWith("mcp-tool-2");
      expect(mockDisconnectServer).toHaveBeenCalledWith("server-1");
    });

    it("does not remove tools from other servers", async () => {
      mockGetToolsBySource.mockReturnValue([
        { id: "mcp-tool-2", appId: "server-2" },
      ]);

      await disconnectMCPServer("server-1");

      expect(mockUnregisterTool).not.toHaveBeenCalled();
      expect(mockDisconnectServer).toHaveBeenCalledWith("server-1");
    });

    it("logs disconnection", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await disconnectMCPServer("server-1");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Disconnected from server-1"),
      );
      consoleSpy.mockRestore();
    });

    it("handles empty tool list", async () => {
      mockGetToolsBySource.mockReturnValue([]);

      await disconnectMCPServer("server-1");

      expect(mockUnregisterTool).not.toHaveBeenCalled();
      expect(mockDisconnectServer).toHaveBeenCalledWith("server-1");
    });
  });

  describe("disconnectAllMCPServers", () => {
    it("unregisters all MCP tools and disconnects all", async () => {
      await disconnectAllMCPServers();

      expect(mockUnregisterBySource).toHaveBeenCalledWith("mcp");
      expect(mockDisconnectAll).toHaveBeenCalled();
    });

    it("logs error on failure without throwing", async () => {
      mockDisconnectAll.mockRejectedValue(new Error("disconnect failed"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await disconnectAllMCPServers();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("disconnectAll"),
        "disconnect failed",
      );
      consoleSpy.mockRestore();
    });
  });

  describe("autoConnectMCPServers", () => {
    it("does nothing when no servers configured", async () => {
      mockLoadMCPServers.mockReturnValue([]);

      await autoConnectMCPServers();

      expect(mockConnectServer).not.toHaveBeenCalled();
    });

    it("connects to enabled servers", async () => {
      mockLoadMCPServers.mockReturnValue([
        { id: "s1", name: "Server 1", command: "npx", args: [] },
        { id: "s2", name: "Server 2", command: "npx", args: [] },
      ]);
      mockConnectServer.mockResolvedValue({
        tools: [],
        resources: [],
        prompts: [],
      });

      await autoConnectMCPServers();

      expect(mockConnectServer).toHaveBeenCalledTimes(2);
    });

    it("skips disabled servers", async () => {
      mockLoadMCPServers.mockReturnValue([
        { id: "s1", name: "Server 1", command: "npx", args: [], enabled: false },
        { id: "s2", name: "Server 2", command: "npx", args: [], enabled: true },
      ]);
      mockConnectServer.mockResolvedValue({
        tools: [],
        resources: [],
        prompts: [],
      });

      await autoConnectMCPServers();

      expect(mockConnectServer).toHaveBeenCalledTimes(1);
    });

    it("continues connecting other servers when one fails", async () => {
      mockLoadMCPServers.mockReturnValue([
        { id: "s1", name: "Server 1", command: "npx", args: [] },
        { id: "s2", name: "Server 2", command: "npx", args: [] },
      ]);
      mockConnectServer
        .mockRejectedValueOnce(new Error("connection failed"))
        .mockResolvedValueOnce({ tools: [], resources: [], prompts: [] });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await autoConnectMCPServers();

      expect(mockConnectServer).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to auto-connect s1"),
        "connection failed",
      );
      consoleSpy.mockRestore();
    });

    it("filters out servers with enabled explicitly set to false", async () => {
      mockLoadMCPServers.mockReturnValue([
        { id: "s1", name: "Server 1", command: "npx", args: [], enabled: undefined },
        { id: "s2", name: "Server 2", command: "npx", args: [], enabled: false },
      ]);
      mockConnectServer.mockResolvedValue({
        tools: [],
        resources: [],
        prompts: [],
      });

      await autoConnectMCPServers();

      // enabled: undefined is not === false, so it passes the filter
      expect(mockConnectServer).toHaveBeenCalledTimes(1);
    });

    it("auto-connects all servers without explicit enabled field", async () => {
      mockLoadMCPServers.mockReturnValue([
        { id: "s1", name: "Server 1", command: "npx", args: [] },
        { id: "s2", name: "Server 2", command: "npx", args: [] },
      ]);
      mockConnectServer.mockResolvedValue({
        tools: [],
        resources: [],
        prompts: [],
      });

      await autoConnectMCPServers();

      expect(mockConnectServer).toHaveBeenCalledTimes(2);
    });
  });
});
