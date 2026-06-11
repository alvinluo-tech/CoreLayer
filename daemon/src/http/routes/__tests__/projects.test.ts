import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockGetByWorkspaceId, mockGetById, mockCreate, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockGetByWorkspaceId: vi.fn(),
  mockGetById: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("../../../persistence/factory.js", () => ({
  getRepositories: () => ({
    projects: {
      getByWorkspaceId: (...args: unknown[]) => mockGetByWorkspaceId(...args),
      getById: (...args: unknown[]) => mockGetById(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
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

import app from "../projects.js";

function makeRequest(path: string, method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`http://localhost${path}`, init);
}

describe("projects route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /", () => {
    it("returns projects for a workspace", async () => {
      mockGetByWorkspaceId.mockResolvedValue([{ id: "p1", name: "Project 1" }]);

      const res = await app.fetch(makeRequest("/?workspaceId=ws1"));
      const json = (await res.json()) as { data: unknown[] };

      expect(res.status).toBe(200);
      expect(json.data).toHaveLength(1);
    });

    it("returns 400 when workspaceId is missing", async () => {
      const res = await app.fetch(makeRequest("/"));
      expect(res.status).toBe(400);
    });
  });

  describe("GET /:id", () => {
    it("returns project by id", async () => {
      mockGetById.mockResolvedValue({ id: "p1", name: "Project" });

      const res = await app.fetch(makeRequest("/p1"));
      const json = (await res.json()) as { data: { id: string } };

      expect(res.status).toBe(200);
      expect(json.data.id).toBe("p1");
    });

    it("returns 404 when not found", async () => {
      mockGetById.mockResolvedValue(null);

      const res = await app.fetch(makeRequest("/nonexistent"));
      expect(res.status).toBe(404);
    });
  });

  describe("POST /", () => {
    it("creates project with valid body", async () => {
      mockCreate.mockResolvedValue({ id: "p-new", name: "New" });

      const res = await app.fetch(
        makeRequest("/", "POST", { workspaceId: "ws1", name: "New" }),
      );
      const json = (await res.json()) as { data: { id: string } };

      expect(res.status).toBe(201);
      expect(json.data.id).toBe("p-new");
    });

    it("returns 400 when workspaceId is missing", async () => {
      const res = await app.fetch(
        makeRequest("/", "POST", { name: "Test" }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when name is missing", async () => {
      const res = await app.fetch(
        makeRequest("/", "POST", { workspaceId: "ws1" }),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /:id", () => {
    it("updates project", async () => {
      mockGetById.mockResolvedValue({ id: "p1" });
      mockUpdate.mockResolvedValue({ id: "p1", name: "Updated" });

      const res = await app.fetch(
        makeRequest("/p1", "PATCH", { name: "Updated" }),
      );
      const json = (await res.json()) as { data: { name: string } };

      expect(res.status).toBe(200);
      expect(json.data.name).toBe("Updated");
    });

    it("returns 404 when project not found", async () => {
      mockGetById.mockResolvedValue(null);

      const res = await app.fetch(
        makeRequest("/nonexistent", "PATCH", { name: "X" }),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /:id", () => {
    it("deletes project", async () => {
      mockDelete.mockResolvedValue(true);

      const res = await app.fetch(makeRequest("/p1", "DELETE"));
      const json = (await res.json()) as { success: boolean };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("returns 404 when not found", async () => {
      mockDelete.mockResolvedValue(false);

      const res = await app.fetch(makeRequest("/nonexistent", "DELETE"));
      expect(res.status).toBe(404);
    });
  });
});
