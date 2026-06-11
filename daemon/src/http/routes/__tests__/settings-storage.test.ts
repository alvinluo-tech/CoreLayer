import { describe, it, expect, beforeEach, vi } from "vitest";

const mockGetCurrentMode = vi.fn().mockReturnValue("local");
const mockIsCloudConfigured = vi.fn().mockReturnValue(false);
const mockGetDbConfig = vi.fn().mockReturnValue({});
const mockSetDbConfig = vi.fn();
const mockSwitchStorageMode = vi.fn().mockResolvedValue(undefined);
const mockSetStorageMode = vi.fn();
const mockGetRepositories = vi.fn();

vi.mock("../../../config/env.js", () => ({
  env: {
    DATABASE_URL: "",
  },
}));

vi.mock("../../../config/app-paths.js", () => ({
  resolveAppPaths: () => ({
    sqlitePath: "/tmp/test.db",
    configDir: "/tmp/config",
  }),
}));

vi.mock("../../../config/storage-config.js", () => ({
  setStorageMode: (...args: unknown[]) => mockSetStorageMode(...args),
  isCloudConfigured: (...args: unknown[]) => mockIsCloudConfigured(...args),
  getDbConfig: (...args: unknown[]) => mockGetDbConfig(...args),
  setDbConfig: (...args: unknown[]) => mockSetDbConfig(...args),
}));

vi.mock("../../../persistence/factory.js", () => ({
  getCurrentMode: (...args: unknown[]) => mockGetCurrentMode(...args),
  switchStorageMode: (...args: unknown[]) => mockSwitchStorageMode(...args),
  getRepositories: (...args: unknown[]) => mockGetRepositories(...args),
}));

vi.mock("../../../shared/errors.js", () => ({
  apiError: vi.fn((_c: unknown, message: string, status = 500) =>
    new Response(JSON.stringify({ error: message }), { status }),
  ),
  logError: vi.fn(),
}));

vi.mock("../settings-helpers.js", () => ({
  maskApiKey: (key: string | undefined) => key ? "*".repeat(Math.max(0, key.length - 4)) + key.slice(-4) : "",
  isMaskedKey: (key: string) => /^\*{4,}/.test(key),
}));

// Mock fs for db-stats
const { mockStatSync } = vi.hoisted(() => ({
  mockStatSync: vi.fn().mockReturnValue({ size: 1024 * 512 }),
}));

vi.mock("fs", () => ({
  readFileSync: vi.fn().mockReturnValue("{}"),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  statSync: mockStatSync,
  appendFileSync: vi.fn(),
  watch: vi.fn(),
  default: {},
}));

const { MockPgClient } = vi.hoisted(() => {
  const MockPgClient = vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue({}),
    end: vi.fn().mockResolvedValue(undefined),
  }));
  return { MockPgClient };
});

vi.mock("pg", () => ({
  default: { Client: MockPgClient },
}));

import app from "../settings-storage.js";

function makeRequest(path: string, method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`http://localhost${path}`, init);
}

describe("settings-storage routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentMode.mockReturnValue("local");
    mockIsCloudConfigured.mockReturnValue(false);
    mockGetDbConfig.mockReturnValue({});
    mockStatSync.mockReturnValue({ size: 1024 * 512 });
    MockPgClient.mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({}),
      end: vi.fn().mockResolvedValue(undefined),
    }));
    mockGetRepositories.mockReturnValue({
      conversations: { list: vi.fn().mockResolvedValue([]), clear: vi.fn().mockResolvedValue(0), delete: vi.fn().mockResolvedValue(true) },
      tasks: { query: vi.fn().mockResolvedValue([]), clear: vi.fn().mockResolvedValue(0), delete: vi.fn().mockResolvedValue(true) },
      articles: { list: vi.fn().mockResolvedValue([]), clear: vi.fn().mockResolvedValue(0), delete: vi.fn().mockResolvedValue(true) },
      memories: { getAll: vi.fn().mockResolvedValue([]), clear: vi.fn().mockResolvedValue(0), delete: vi.fn().mockResolvedValue(true) },
    });
  });

  // ---- GET / ----
  describe("GET /", () => {
    it("returns current settings", async () => {
      mockGetCurrentMode.mockReturnValue("local");
      const res = await app.fetch(makeRequest("/"));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { storageMode: string };
      expect(json.storageMode).toBe("local");
    });
  });

  // ---- PUT /storage-mode ----
  describe("PUT /storage-mode", () => {
    it("switches to local mode", async () => {
      const res = await app.fetch(makeRequest("/storage-mode", "PUT", { mode: "local" }));
      expect(res.status).toBe(200);
      expect(mockSwitchStorageMode).toHaveBeenCalledWith("local");
    });

    it("rejects invalid mode", async () => {
      const res = await app.fetch(makeRequest("/storage-mode", "PUT", { mode: "invalid" }));
      expect(res.status).toBe(400);
    });

    it("rejects cloud mode when not configured", async () => {
      mockIsCloudConfigured.mockReturnValue(false);
      const res = await app.fetch(makeRequest("/storage-mode", "PUT", { mode: "cloud" }));
      expect(res.status).toBe(400);
    });

    it("allows cloud mode when configured", async () => {
      mockIsCloudConfigured.mockReturnValue(true);
      const res = await app.fetch(makeRequest("/storage-mode", "PUT", { mode: "cloud" }));
      expect(res.status).toBe(200);
    });

    it("rejects postgres mode without DATABASE_URL", async () => {
      mockGetDbConfig.mockReturnValue({});
      const res = await app.fetch(makeRequest("/storage-mode", "PUT", { mode: "postgres" }));
      expect(res.status).toBe(400);
    });
  });

  // ---- GET /db-config ----
  describe("GET /db-config", () => {
    it("returns db config with masked keys", async () => {
      mockGetDbConfig.mockReturnValue({
        supabaseUrl: "https://test.supabase.co",
        supabaseServiceKey: "sk-test-key-1234",
        postgresUrl: "postgresql://user:pass@host/db",
      });
      const res = await app.fetch(makeRequest("/db-config"));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { supabaseServiceKey: string; postgresUrl: string };
      expect(json.supabaseServiceKey).toContain("*");
      expect(json.postgresUrl).toContain("*");
    });
  });

  // ---- POST /db-config ----
  describe("POST /db-config", () => {
    it("saves db config", async () => {
      mockGetCurrentMode.mockReturnValue("local");
      const res = await app.fetch(makeRequest("/db-config", "POST", {
        supabaseUrl: "https://new.supabase.co",
        supabaseServiceKey: "new-key",
      }));
      expect(res.status).toBe(200);
      expect(mockSetDbConfig).toHaveBeenCalled();
    });

    it("skips masked keys when saving", async () => {
      mockGetCurrentMode.mockReturnValue("local");
      mockGetDbConfig.mockReturnValue({ supabaseServiceKey: "old-key" });
      const res = await app.fetch(makeRequest("/db-config", "POST", {
        supabaseServiceKey: "****",
      }));
      expect(res.status).toBe(200);
      const call = mockSetDbConfig.mock.calls[0][0];
      expect(call.supabaseServiceKey).toBe("old-key");
    });

    it("switches storage mode when current mode is cloud", async () => {
      mockGetCurrentMode.mockReturnValue("cloud");
      mockIsCloudConfigured.mockReturnValue(true);
      const res = await app.fetch(makeRequest("/db-config", "POST", {
        supabaseUrl: "https://new.supabase.co",
      }));
      expect(res.status).toBe(200);
      expect(mockSwitchStorageMode).toHaveBeenCalledWith("cloud");
    });
  });

  // ---- POST /db-config/test ----
  describe("POST /db-config/test", () => {
    it("tests supabase connection", async () => {
      mockGetDbConfig.mockReturnValue({
        supabaseUrl: "https://test.supabase.co",
        supabaseServiceKey: "test-key",
      });
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
      const res = await app.fetch(makeRequest("/db-config/test", "POST", {
        type: "supabase",
        supabaseUrl: "https://test.supabase.co",
        supabaseServiceKey: "test-key",
      }));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean };
      expect(json.success).toBe(true);
      vi.restoreAllMocks();
    });

    it("returns error when supabase credentials missing", async () => {
      mockGetDbConfig.mockReturnValue({});
      const res = await app.fetch(makeRequest("/db-config/test", "POST", { type: "supabase" }));
      expect(res.status).toBe(400);
    });

    it("tests postgres connection", async () => {
      mockGetDbConfig.mockReturnValue({ postgresUrl: "postgresql://user:pass@host/db" });
      const res = await app.fetch(makeRequest("/db-config/test", "POST", { type: "postgres" }));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean };
      expect(json.success).toBe(true);
    });

    it("returns error when postgres URL missing", async () => {
      mockGetDbConfig.mockReturnValue({});
      const res = await app.fetch(makeRequest("/db-config/test", "POST", { type: "postgres" }));
      expect(res.status).toBe(400);
    });
  });

  // ---- POST /db-config/migrate ----
  describe("POST /db-config/migrate", () => {
    it("runs migration successfully", async () => {
      mockGetDbConfig.mockReturnValue({ postgresUrl: "postgresql://user:pass@host/db" });
      const res = await app.fetch(makeRequest("/db-config/migrate", "POST"));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean };
      expect(json.success).toBe(true);
    });

    it("returns error when no connection string", async () => {
      mockGetDbConfig.mockReturnValue({});
      const res = await app.fetch(makeRequest("/db-config/migrate", "POST"));
      expect(res.status).toBe(400);
    });
  });

  // ---- GET /db-stats ----
  describe("GET /db-stats", () => {
    it("returns stats for local mode", async () => {
      mockGetCurrentMode.mockReturnValue("local");
      const res = await app.fetch(makeRequest("/db-stats"));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean; dbSize: string; entryCount: Record<string, number> };
      expect(json.success).toBe(true);
      expect(json.entryCount).toBeDefined();
    });

    it("returns stats for cloud mode", async () => {
      mockGetCurrentMode.mockReturnValue("cloud");
      const res = await app.fetch(makeRequest("/db-stats"));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { dbSize: string };
      expect(json.dbSize).toBe("云端托管");
    });
  });

  // ---- GET /db-manager/tables ----
  describe("GET /db-manager/tables", () => {
    it("returns table list with counts", async () => {
      const res = await app.fetch(makeRequest("/db-manager/tables"));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { tables: Array<{ id: string; count: number }> };
      expect(json.tables).toHaveLength(4);
      expect(json.tables.map(t => t.id)).toContain("conversations");
    });
  });

  // ---- GET /db-manager/tables/:name ----
  describe("GET /db-manager/tables/:name", () => {
    it("returns rows for conversations", async () => {
      const res = await app.fetch(makeRequest("/db-manager/tables/conversations"));
      expect(res.status).toBe(200);
    });

    it("returns rows for tasks", async () => {
      const res = await app.fetch(makeRequest("/db-manager/tables/tasks"));
      expect(res.status).toBe(200);
    });

    it("returns rows for articles", async () => {
      const res = await app.fetch(makeRequest("/db-manager/tables/articles"));
      expect(res.status).toBe(200);
    });

    it("returns rows for memories", async () => {
      const res = await app.fetch(makeRequest("/db-manager/tables/memories"));
      expect(res.status).toBe(200);
    });

    it("returns 400 for unsupported table", async () => {
      const res = await app.fetch(makeRequest("/db-manager/tables/unsupported"));
      expect(res.status).toBe(400);
    });
  });

  // ---- DELETE /db-manager/tables/:name/:id ----
  describe("DELETE /db-manager/tables/:name/:id", () => {
    it("deletes a conversation", async () => {
      const res = await app.fetch(makeRequest("/db-manager/tables/conversations/conv-1", "DELETE"));
      expect(res.status).toBe(200);
    });

    it("deletes a task", async () => {
      const res = await app.fetch(makeRequest("/db-manager/tables/tasks/task-1", "DELETE"));
      expect(res.status).toBe(200);
    });

    it("deletes an article", async () => {
      const res = await app.fetch(makeRequest("/db-manager/tables/articles/art-1", "DELETE"));
      expect(res.status).toBe(200);
    });

    it("deletes a memory", async () => {
      const res = await app.fetch(makeRequest("/db-manager/tables/memories/mem-1", "DELETE"));
      expect(res.status).toBe(200);
    });

    it("returns 400 for unsupported table", async () => {
      const res = await app.fetch(makeRequest("/db-manager/tables/unsupported/id-1", "DELETE"));
      expect(res.status).toBe(400);
    });
  });

  // ---- POST /db-manager/tables/:name/clear ----
  describe("POST /db-manager/tables/:name/clear", () => {
    it("clears conversations", async () => {
      const res = await app.fetch(makeRequest("/db-manager/tables/conversations/clear", "POST"));
      expect(res.status).toBe(200);
    });

    it("clears tasks", async () => {
      const res = await app.fetch(makeRequest("/db-manager/tables/tasks/clear", "POST"));
      expect(res.status).toBe(200);
    });

    it("clears articles", async () => {
      const res = await app.fetch(makeRequest("/db-manager/tables/articles/clear", "POST"));
      expect(res.status).toBe(200);
    });

    it("clears memories", async () => {
      const res = await app.fetch(makeRequest("/db-manager/tables/memories/clear", "POST"));
      expect(res.status).toBe(200);
    });

    it("returns 400 for unsupported table", async () => {
      const res = await app.fetch(makeRequest("/db-manager/tables/unsupported/clear", "POST"));
      expect(res.status).toBe(400);
    });
  });
});
