import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockGetAllServerInfo, mockGetServerInfo, mockGetAllTools, mockGetAllResources, mockGetAllPrompts, mockCallTool, mockReadResource, mockConnectMCPServer, mockDisconnectMCPServer, mockAddMCPServer, mockRemoveMCPServer } = vi.hoisted(() => ({
  mockGetAllServerInfo: vi.fn(),
  mockGetServerInfo: vi.fn(),
  mockGetAllTools: vi.fn(),
  mockGetAllResources: vi.fn(),
  mockGetAllPrompts: vi.fn(),
  mockCallTool: vi.fn(),
  mockReadResource: vi.fn(),
  mockConnectMCPServer: vi.fn(),
  mockDisconnectMCPServer: vi.fn(),
  mockAddMCPServer: vi.fn(),
  mockRemoveMCPServer: vi.fn(),
}));

vi.mock("../../../gateways/mcp/client.js", () => ({
  getMCPManager: () => ({
    getAllServerInfo: (...args: unknown[]) => mockGetAllServerInfo(...args),
    getServerInfo: (...args: unknown[]) => mockGetServerInfo(...args),
    getAllTools: (...args: unknown[]) => mockGetAllTools(...args),
    getAllResources: (...args: unknown[]) => mockGetAllResources(...args),
    getAllPrompts: (...args: unknown[]) => mockGetAllPrompts(...args),
    callTool: (...args: unknown[]) => mockCallTool(...args),
    readResource: (...args: unknown[]) => mockReadResource(...args),
  }),
  connectMCPServer: (...args: unknown[]) => mockConnectMCPServer(...args),
  disconnectMCPServer: (...args: unknown[]) => mockDisconnectMCPServer(...args),
}));

vi.mock("../../../config/mcp-config.js", () => ({
  loadMCPServers: () => [],
  addMCPServer: (...args: unknown[]) => mockAddMCPServer(...args),
  removeMCPServer: (...args: unknown[]) => mockRemoveMCPServer(...args),
}));

import app from "../mcp.js";

function makeRequest(path: string, method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`http://localhost${path}`, init);
}

describe("mcp route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllServerInfo.mockReturnValue([]);
    mockGetServerInfo.mockReturnValue(null);
    mockGetAllTools.mockReturnValue([]);
    mockGetAllResources.mockReturnValue([]);
    mockGetAllPrompts.mockReturnValue([]);
    mockCallTool.mockResolvedValue({ content: "result" });
    mockReadResource.mockResolvedValue({ contents: [] });
    mockConnectMCPServer.mockResolvedValue(undefined);
    mockDisconnectMCPServer.mockResolvedValue(undefined);
  });

  describe("GET /servers", () => {
    it("returns all server info", async () => {
      mockGetAllServerInfo.mockReturnValue([{ id: "s1", name: "Test Server" }]);

      const res = await app.fetch(makeRequest("/servers"));
      const json = (await res.json()) as { servers: unknown[] };

      expect(res.status).toBe(200);
      expect(json.servers).toHaveLength(1);
    });
  });

  describe("GET /servers/:id", () => {
    it("returns server info", async () => {
      mockGetServerInfo.mockReturnValue({ id: "s1", name: "Test" });

      const res = await app.fetch(makeRequest("/servers/s1"));
      const json = (await res.json()) as { id: string };

      expect(res.status).toBe(200);
      expect(json.id).toBe("s1");
    });

    it("returns 404 when not found", async () => {
      mockGetServerInfo.mockReturnValue(null);

      const res = await app.fetch(makeRequest("/servers/nonexistent"));
      expect(res.status).toBe(404);
    });
  });

  describe("POST /servers", () => {
    it("connects to a new server", async () => {
      mockConnectMCPServer.mockResolvedValue(undefined);
      mockGetServerInfo.mockReturnValue({ id: "s1" });

      const res = await app.fetch(
        makeRequest("/servers", "POST", { id: "s1", name: "Test", transport: { type: "stdio" } }),
      );
      const json = (await res.json()) as { success: boolean };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("returns 400 when required fields missing", async () => {
      const res = await app.fetch(
        makeRequest("/servers", "POST", { id: "s1" }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 500 on connect failure", async () => {
      mockConnectMCPServer.mockRejectedValue(new Error("connect failed"));

      const res = await app.fetch(
        makeRequest("/servers", "POST", { id: "s1", name: "Test", transport: { type: "stdio" } }),
      );
      expect(res.status).toBe(500);
    });
  });

  describe("PUT /servers/:id", () => {
    it("updates server (disconnect + reconnect)", async () => {
      mockDisconnectMCPServer.mockResolvedValue(undefined);
      mockConnectMCPServer.mockResolvedValue(undefined);
      mockGetServerInfo.mockReturnValue({ id: "s1" });

      const res = await app.fetch(
        makeRequest("/servers/s1", "PUT", { name: "Updated", transport: { type: "stdio" } }),
      );
      const json = (await res.json()) as { success: boolean };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockDisconnectMCPServer).toHaveBeenCalledWith("s1");
      expect(mockConnectMCPServer).toHaveBeenCalled();
    });
  });

  describe("DELETE /servers/:id", () => {
    it("disconnects server", async () => {
      const res = await app.fetch(makeRequest("/servers/s1", "DELETE"));
      const json = (await res.json()) as { success: boolean };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockDisconnectMCPServer).toHaveBeenCalledWith("s1");
      expect(mockRemoveMCPServer).toHaveBeenCalledWith("s1");
    });

    it("returns 500 on disconnect failure", async () => {
      mockDisconnectMCPServer.mockRejectedValue(new Error("disconnect failed"));

      const res = await app.fetch(makeRequest("/servers/s1", "DELETE"));
      expect(res.status).toBe(500);
    });
  });

  describe("GET /tools", () => {
    it("returns all tools from all servers", async () => {
      mockGetAllTools.mockReturnValue([{ id: "t1", name: "Tool 1" }]);

      const res = await app.fetch(makeRequest("/tools"));
      const json = (await res.json()) as { tools: unknown[]; count: number };

      expect(res.status).toBe(200);
      expect(json.tools).toHaveLength(1);
      expect(json.count).toBe(1);
    });
  });

  describe("GET /resources", () => {
    it("returns all resources", async () => {
      mockGetAllResources.mockReturnValue([{ uri: "file:///test" }]);

      const res = await app.fetch(makeRequest("/resources"));
      const json = (await res.json()) as { resources: unknown[]; count: number };

      expect(res.status).toBe(200);
      expect(json.resources).toHaveLength(1);
    });
  });

  describe("GET /prompts", () => {
    it("returns all prompts", async () => {
      mockGetAllPrompts.mockReturnValue([{ name: "p1" }]);

      const res = await app.fetch(makeRequest("/prompts"));
      const json = (await res.json()) as { prompts: unknown[]; count: number };

      expect(res.status).toBe(200);
      expect(json.prompts).toHaveLength(1);
    });
  });

  describe("POST /servers/:id/tools/:toolName", () => {
    it("calls tool on server", async () => {
      mockCallTool.mockResolvedValue({ content: "output" });

      const res = await app.fetch(
        makeRequest("/servers/s1/tools/myTool", "POST", { input: "test" }),
      );
      const json = (await res.json()) as { content: string };

      expect(res.status).toBe(200);
      expect(json.content).toBe("output");
      expect(mockCallTool).toHaveBeenCalledWith("s1", "myTool", { input: "test" });
    });

    it("returns 500 on call failure", async () => {
      mockCallTool.mockRejectedValue(new Error("call failed"));

      const res = await app.fetch(
        makeRequest("/servers/s1/tools/myTool", "POST", {}),
      );
      expect(res.status).toBe(500);
    });
  });

  describe("GET /servers/:id/resources/*", () => {
    it("reads resource from server", async () => {
      mockReadResource.mockResolvedValue({ contents: [{ text: "data" }] });

      const res = await app.fetch(makeRequest("/servers/s1/resources/file:///test"));
      const json = (await res.json()) as { contents: unknown[] };

      expect(res.status).toBe(200);
      expect(json.contents).toHaveLength(1);
    });
  });
});
