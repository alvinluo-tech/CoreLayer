import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("fs", () => ({
  default: {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import { existsSync, readFileSync, writeFileSync } from "fs";
import { loadMCPServers, saveMCPServers, addMCPServer, removeMCPServer } from "./mcp-config.js";

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

describe("mcp-config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loadMCPServers", () => {
    it("returns empty array when config file does not exist", () => {
      mockedExistsSync.mockReturnValue(false);

      const result = loadMCPServers();

      expect(result).toEqual([]);
    });

    it("loads servers from valid config file", () => {
      const servers = [{ id: "server-1", name: "Test Server", transport: "stdio" as const, command: "node", enabled: true, permissions: { read: true, write: false, delete: false, bulkWrite: false }, riskPolicy: { low: "auto", medium: "notify", high: "confirm", critical: "deny" } }] as any;
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify({ version: 1, servers }));

      const result = loadMCPServers();

      expect(result).toEqual(servers);
    });

    it("returns empty array when version is not 1", () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify({ version: 2, servers: [] }));

      const result = loadMCPServers();

      expect(result).toEqual([]);
    });

    it("returns empty array when servers is not an array", () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify({ version: 1, servers: "not-array" }));

      const result = loadMCPServers();

      expect(result).toEqual([]);
    });

    it("returns empty array on JSON parse error", () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue("invalid-json");

      const result = loadMCPServers();

      expect(result).toEqual([]);
    });

    it("returns empty array when file read throws", () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockImplementation(() => {
        throw new Error("EACCES");
      });

      const result = loadMCPServers();

      expect(result).toEqual([]);
    });
  });

  describe("saveMCPServers", () => {
    it("writes config file with correct format", () => {
      const servers = [{ id: "s1", name: "S1", transport: "stdio" as const, command: "node", enabled: true, permissions: { read: true, write: false, delete: false, bulkWrite: false }, riskPolicy: { low: "auto", medium: "notify", high: "confirm", critical: "deny" } }] as any;

      saveMCPServers(servers);

      expect(mockedWriteFileSync).toHaveBeenCalled();
      const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
      expect(written.version).toBe(1);
      expect(written.servers).toEqual(servers);
    });
  });

  describe("addMCPServer", () => {
    it("adds a new server to empty list", () => {
      mockedExistsSync.mockReturnValue(false);
      const config = { id: "new", name: "New", transport: "stdio" as const, command: "echo", enabled: true, permissions: { read: true, write: false, delete: false, bulkWrite: false }, riskPolicy: { low: "auto", medium: "notify", high: "confirm", critical: "deny" } } as any;

      addMCPServer(config);

      expect(mockedWriteFileSync).toHaveBeenCalled();
      const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
      expect(written.servers).toHaveLength(1);
      expect(written.servers[0]).toEqual(config);
    });

    it("updates existing server with same id", () => {
      const existing = [{ id: "s1", name: "Old", transport: "stdio" as const, command: "old" }];
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify({ version: 1, servers: existing }));

      const updated = { id: "s1", name: "Updated", transport: "stdio" as const, command: "new" } as any;
      addMCPServer(updated);

      const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
      expect(written.servers).toHaveLength(1);
      expect(written.servers[0].name).toBe("Updated");
    });

    it("appends new server to existing list", () => {
      const existing = [{ id: "s1", name: "S1", transport: "stdio" as const, command: "a" }];
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify({ version: 1, servers: existing }));

      const newServer = { id: "s2", name: "S2", transport: "sse" as const, url: "http://localhost" } as any;
      addMCPServer(newServer);

      const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
      expect(written.servers).toHaveLength(2);
      expect(written.servers[1].id).toBe("s2");
    });
  });

  describe("removeMCPServer", () => {
    it("removes server by id", () => {
      const servers = [
        { id: "s1", name: "S1", transport: "stdio" as const, command: "a" },
        { id: "s2", name: "S2", transport: "stdio" as const, command: "b" },
      ];
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify({ version: 1, servers }));

      removeMCPServer("s1");

      const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
      expect(written.servers).toHaveLength(1);
      expect(written.servers[0].id).toBe("s2");
    });

    it("handles removing non-existent server gracefully", () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(
        JSON.stringify({ version: 1, servers: [{ id: "s1", name: "S1", transport: "stdio" as const, command: "a" }] }),
      );

      removeMCPServer("nonexistent");

      const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
      expect(written.servers).toHaveLength(1);
    });
  });
});
