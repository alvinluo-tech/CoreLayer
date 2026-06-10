import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockGetCurrentMode, mockIsCloudConfigured, mockGetDbConfig, mockSetDbConfig, mockSetStorageMode, mockSwitchStorageMode, mockGetRepositories, mockMaskApiKey, mockIsMaskedKey, mockResolveAppPaths } = vi.hoisted(() => ({
  mockGetCurrentMode: vi.fn(),
  mockIsCloudConfigured: vi.fn(),
  mockGetDbConfig: vi.fn(),
  mockSetDbConfig: vi.fn(),
  mockSetStorageMode: vi.fn(),
  mockSwitchStorageMode: vi.fn(),
  mockGetRepositories: vi.fn(),
  mockMaskApiKey: vi.fn(),
  mockIsMaskedKey: vi.fn(),
  mockResolveAppPaths: vi.fn(),
}));

vi.mock("../../config/env.js", () => ({
  env: { DATABASE_URL: "" },
}));

vi.mock("../../config/app-paths.js", () => ({
  resolveAppPaths: (...args: unknown[]) => mockResolveAppPaths(...args),
}));

vi.mock("../../config/storage-config.js", () => ({
  setStorageMode: (...args: unknown[]) => mockSetStorageMode(...args),
  isCloudConfigured: (...args: unknown[]) => mockIsCloudConfigured(...args),
  getDbConfig: (...args: unknown[]) => mockGetDbConfig(...args),
  setDbConfig: (...args: unknown[]) => mockSetDbConfig(...args),
}));

vi.mock("../../persistence/factory.js", () => ({
  getCurrentMode: (...args: unknown[]) => mockGetCurrentMode(...args),
  switchStorageMode: (...args: unknown[]) => mockSwitchStorageMode(...args),
  getRepositories: (...args: unknown[]) => mockGetRepositories(...args),
}));

vi.mock("../../shared/errors.js", () => ({
  apiError: vi.fn((_c: unknown, message: string, status = 500) =>
    new Response(JSON.stringify({ error: message }), { status }),
  ),
  logError: vi.fn(),
}));

vi.mock("./settings-helpers.js", () => ({
  maskApiKey: (...args: unknown[]) => mockMaskApiKey(...args),
  isMaskedKey: (...args: unknown[]) => mockIsMaskedKey(...args),
}));

import app from "./settings-storage.js";

function makeRequest(path: string, method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`http://localhost${path}`, init);
}

describe("settings-storage route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentMode.mockReturnValue("local");
    mockIsCloudConfigured.mockReturnValue(false);
    mockGetDbConfig.mockReturnValue({ supabaseUrl: "", supabaseServiceKey: "", postgresUrl: "" });
    mockMaskApiKey.mockImplementation((k: string | undefined) => k ? "*".repeat(Math.max(0, k.length - 4)) + k.slice(-4) : "");
    mockIsMaskedKey.mockImplementation((k: string) => /^\*{4,}/.test(k));
    mockResolveAppPaths.mockReturnValue({ sqlitePath: "/tmp/test.db" });
    mockGetRepositories.mockReturnValue({
      conversations: { list: vi.fn().mockResolvedValue([]) },
      tasks: { query: vi.fn().mockResolvedValue([]) },
      articles: { list: vi.fn().mockResolvedValue([]) },
      memories: { getAll: vi.fn().mockResolvedValue([]) },
    });
  });

  describe("GET /", () => {
    it("returns current storage mode", async () => {
      mockGetCurrentMode.mockReturnValue("local");

      const res = await app.fetch(makeRequest("/"));
      const json = (await res.json()) as { storageMode: string; availableModes: string[] };

      expect(res.status).toBe(200);
      expect(json.storageMode).toBe("local");
      expect(json.availableModes).toContain("local");
    });
  });

  describe("PUT /storage-mode", () => {
    it("switches to valid mode", async () => {
      mockGetCurrentMode.mockReturnValue("local");

      const res = await app.fetch(
        makeRequest("/storage-mode", "PUT", { mode: "local" }),
      );
      const json = (await res.json()) as { storageMode: string; message: string };

      expect(res.status).toBe(200);
      expect(json.storageMode).toBe("local");
    });

    it("returns 400 for invalid mode", async () => {
      const res = await app.fetch(
        makeRequest("/storage-mode", "PUT", { mode: "invalid" }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when cloud mode not configured", async () => {
      mockIsCloudConfigured.mockReturnValue(false);

      const res = await app.fetch(
        makeRequest("/storage-mode", "PUT", { mode: "cloud" }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when postgres mode not configured", async () => {
      mockGetDbConfig.mockReturnValue({ postgresUrl: "" });

      const res = await app.fetch(
        makeRequest("/storage-mode", "PUT", { mode: "postgres" }),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("GET /db-config", () => {
    it("returns masked db config", async () => {
      mockGetDbConfig.mockReturnValue({
        supabaseUrl: "https://test.supabase.co",
        supabaseServiceKey: "secret-key-12345",
        postgresUrl: "postgres://localhost/db",
      });
      mockMaskApiKey.mockImplementation((k: string | undefined) => {
        if (!k) return "";
        return "*".repeat(Math.max(0, k.length - 4)) + k.slice(-4);
      });

      const res = await app.fetch(makeRequest("/db-config"));
      const json = (await res.json()) as { supabaseUrl: string; supabaseServiceKey: string };

      expect(res.status).toBe(200);
      expect(json.supabaseUrl).toBe("https://test.supabase.co");
      expect(json.supabaseServiceKey).toContain("****");
    });
  });

  describe("POST /db-config", () => {
    it("saves db config", async () => {
      mockGetCurrentMode.mockReturnValue("local");

      const res = await app.fetch(
        makeRequest("/db-config", "POST", { supabaseUrl: "https://new.supabase.co" }),
      );
      const json = (await res.json()) as { success: boolean };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("preserves masked keys on save", async () => {
      mockGetCurrentMode.mockReturnValue("local");
      mockIsMaskedKey.mockReturnValue(true);

      const res = await app.fetch(
        makeRequest("/db-config", "POST", { supabaseServiceKey: "**********2345" }),
      );
      expect(res.status).toBe(200);
    });
  });

  describe("GET /db-stats", () => {
    it("returns db stats for local mode", async () => {
      mockGetCurrentMode.mockReturnValue("local");

      const res = await app.fetch(makeRequest("/db-stats"));
      const json = (await res.json()) as { success: boolean; dbSize: string };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      // The route tries to statSync the sqlite file; if it doesn't exist, returns "未就绪"
      expect(json.dbSize).toBeDefined();
    });
  });

  describe("GET /db-manager/tables", () => {
    it("returns table list with counts", async () => {
      const res = await app.fetch(makeRequest("/db-manager/tables"));
      const json = (await res.json()) as { success: boolean; tables: { id: string; count: number }[] };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.tables).toHaveLength(4);
      expect(json.tables.find((t) => t.id === "conversations")).toBeDefined();
    });
  });

  describe("GET /db-manager/tables/:name", () => {
    it("returns rows for a valid table", async () => {
      const res = await app.fetch(makeRequest("/db-manager/tables/conversations"));
      const json = (await res.json()) as { success: boolean; rows: unknown[] };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("returns 400 for invalid table name", async () => {
      const res = await app.fetch(makeRequest("/db-manager/tables/invalid"));
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /db-manager/tables/:name/:id", () => {
    it("deletes a row", async () => {
      const repos = mockGetRepositories();
      repos.conversations.delete = vi.fn().mockResolvedValue(true);

      const res = await app.fetch(makeRequest("/db-manager/tables/conversations/row-1", "DELETE"));
      const json = (await res.json()) as { success: boolean };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("returns 400 for invalid table name", async () => {
      const res = await app.fetch(makeRequest("/db-manager/tables/invalid/row-1", "DELETE"));
      expect(res.status).toBe(400);
    });
  });

  describe("POST /db-manager/tables/:name/clear", () => {
    it("clears a table", async () => {
      const repos = mockGetRepositories();
      repos.conversations.clear = vi.fn().mockResolvedValue(5);

      const res = await app.fetch(makeRequest("/db-manager/tables/conversations/clear", "POST"));
      const json = (await res.json()) as { success: boolean; message: string };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.message).toContain("5");
    });

    it("returns 400 for invalid table name", async () => {
      const res = await app.fetch(makeRequest("/db-manager/tables/invalid/clear", "POST"));
      expect(res.status).toBe(400);
    });
  });
});
