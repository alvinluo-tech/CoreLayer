import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockGetAll, mockGetByType, mockFetchByScope, mockSearchScored, mockUpsert, mockDelete } = vi.hoisted(() => ({
  mockGetAll: vi.fn(),
  mockGetByType: vi.fn(),
  mockFetchByScope: vi.fn(),
  mockSearchScored: vi.fn(),
  mockUpsert: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("../../../persistence/factory.js", () => ({
  getRepositories: () => ({
    memories: {
      getAll: (...args: unknown[]) => mockGetAll(...args),
      getByType: (...args: unknown[]) => mockGetByType(...args),
      fetchByScope: (...args: unknown[]) => mockFetchByScope(...args),
      searchScored: (...args: unknown[]) => mockSearchScored(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
  }),
}));

vi.mock("../../../shared/errors.js", () => ({
  apiError: vi.fn((_c: unknown, message: string, status = 500) =>
    new Response(JSON.stringify({ error: message }), { status }),
  ),
  extractErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  logError: vi.fn(),
}));

vi.mock("../../../persistence/audit-log.js", () => ({
  logAuditEntry: vi.fn().mockResolvedValue(undefined),
}));

import app from "../memories.js";

function makeRequest(path: string, method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`http://localhost${path}`, init);
}

describe("memories route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([]);
    mockGetByType.mockResolvedValue([]);
    mockFetchByScope.mockResolvedValue([]);
    mockSearchScored.mockResolvedValue([]);
    mockUpsert.mockResolvedValue({ id: "m1" });
    mockDelete.mockResolvedValue(true);
  });

  describe("GET /", () => {
    it("returns all memories by default", async () => {
      mockGetAll.mockResolvedValue([{ id: "m1", key: "name" }]);

      const res = await app.fetch(makeRequest("/"));
      const json = (await res.json()) as { data: unknown[] };

      expect(res.status).toBe(200);
      expect(json.data).toHaveLength(1);
    });

    it("filters by type", async () => {
      mockGetByType.mockResolvedValue([{ id: "m1" }]);

      const res = await app.fetch(makeRequest("/?type=fact"));
      const json = (await res.json()) as { data: unknown[] };

      expect(res.status).toBe(200);
      expect(json.data).toHaveLength(1);
      expect(mockGetByType).toHaveBeenCalledWith("fact");
    });

    it("filters by scope", async () => {
      mockFetchByScope.mockResolvedValue([{ id: "m1" }]);

      const res = await app.fetch(makeRequest("/?scopeType=workspace&scopeId=ws1"));
      const json = (await res.json()) as { data: unknown[] };

      expect(res.status).toBe(200);
      expect(json.data).toHaveLength(1);
      expect(mockFetchByScope).toHaveBeenCalledWith("workspace", "ws1");
    });

    it("returns 500 on error", async () => {
      mockGetAll.mockRejectedValue(new Error("db error"));

      const res = await app.fetch(makeRequest("/"));
      expect(res.status).toBe(500);
    });
  });

  describe("GET /search", () => {
    it("searches memories with query", async () => {
      mockSearchScored.mockResolvedValue([{ id: "m1", score: 0.9 }]);

      const res = await app.fetch(makeRequest("/search?q=hello"));
      const json = (await res.json()) as { data: unknown[] };

      expect(res.status).toBe(200);
      expect(json.data).toHaveLength(1);
      expect(mockSearchScored).toHaveBeenCalledWith("hello", "default", 20);
    });

    it("returns 400 when q is missing", async () => {
      const res = await app.fetch(makeRequest("/search"));
      expect(res.status).toBe(400);
    });

    it("passes custom limit", async () => {
      mockSearchScored.mockResolvedValue([]);

      await app.fetch(makeRequest("/search?q=test&limit=5"));

      expect(mockSearchScored).toHaveBeenCalledWith("test", "default", 5);
    });
  });

  describe("PATCH /:id", () => {
    it("updates memory", async () => {
      mockGetAll.mockResolvedValue([{ id: "m1", key: "old", value: "old", type: "fact", scopeType: "user", scopeId: "u1" }]);
      mockUpsert.mockResolvedValue({ id: "m1", key: "new" });

      const res = await app.fetch(
        makeRequest("/m1", "PATCH", { key: "new" }),
      );
      const json = (await res.json()) as { data: { key: string } };

      expect(res.status).toBe(200);
      expect(json.data.key).toBe("new");
    });

    it("returns 404 when memory not found", async () => {
      mockGetAll.mockResolvedValue([]);

      const res = await app.fetch(
        makeRequest("/nonexistent", "PATCH", { key: "x" }),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /:id", () => {
    it("deletes memory", async () => {
      mockGetAll.mockResolvedValue([{ id: "m1", key: "name", value: "val", type: "fact", scopeType: "user", scopeId: "u1" }]);
      mockDelete.mockResolvedValue(true);

      const res = await app.fetch(makeRequest("/m1", "DELETE"));
      const json = (await res.json()) as { success: boolean };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("returns 404 when not found", async () => {
      mockGetAll.mockResolvedValue([]);
      const res = await app.fetch(makeRequest("/nonexistent", "DELETE"));
      expect(res.status).toBe(404);
    });
  });
});
