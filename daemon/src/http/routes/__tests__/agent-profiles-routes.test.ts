import { describe, it, expect, beforeEach, vi } from "vitest";

const mockGetAll = vi.fn();
const mockGetDefault = vi.fn();
const mockGetById = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("../../../persistence/factory.js", () => ({
  getRepositories: () => ({
    agentProfiles: {
      getAll: (...args: unknown[]) => mockGetAll(...args),
      getDefault: (...args: unknown[]) => mockGetDefault(...args),
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
  extractErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
  logError: vi.fn(),
}));

vi.mock("../../../persistence/audit-log.js", () => ({
  logAuditEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../shared/agent-profile-types.js", () => ({
  isAgentModelPolicy: (v: unknown) => {
    if (v == null || typeof v !== "object") return false;
    const obj = v as Record<string, unknown>;
    if (obj.preferredModels !== undefined && !Array.isArray(obj.preferredModels)) return false;
    if (obj.fallbackModel !== undefined && typeof obj.fallbackModel !== "string") return false;
    if (obj.maxTokens !== undefined && typeof obj.maxTokens !== "number") return false;
    if (obj.temperature !== undefined && typeof obj.temperature !== "number") return false;
    if (obj.provider !== undefined && typeof obj.provider !== "string") return false;
    return true;
  },
  isAgentExecutorPolicy: (v: unknown) => {
    if (v == null || typeof v !== "object") return false;
    const obj = v as Record<string, unknown>;
    if (obj.executor === undefined) return false;
    const valid = ["self", "codex", "claude-code", "opencode"];
    if (!valid.includes(obj.executor as string)) return false;
    if (obj.maxConcurrent !== undefined && typeof obj.maxConcurrent !== "number") return false;
    if (obj.workDir !== undefined && typeof obj.workDir !== "string") return false;
    if (obj.extraArgs !== undefined && !Array.isArray(obj.extraArgs)) return false;
    return true;
  },
}));

import app from "../agent-profiles.js";

function makeRequest(path: string, method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`http://localhost${path}`, init);
}

const mockProfile = {
  id: "profile-1",
  name: "Test Agent",
  description: "A test agent",
  isDefault: false,
  skills: [],
  tools: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("agent-profiles routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- GET / ----
  describe("GET /", () => {
    it("returns all profiles", async () => {
      mockGetAll.mockResolvedValue([mockProfile]);
      const res = await app.fetch(makeRequest("/"));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { data: unknown[] };
      expect(json.data).toHaveLength(1);
    });

    it("returns 500 on error", async () => {
      mockGetAll.mockRejectedValue(new Error("db error"));
      const res = await app.fetch(makeRequest("/"));
      expect(res.status).toBe(500);
    });
  });

  // ---- GET /default ----
  describe("GET /default", () => {
    it("returns default profile", async () => {
      mockGetDefault.mockResolvedValue({ ...mockProfile, isDefault: true });
      const res = await app.fetch(makeRequest("/default"));
      expect(res.status).toBe(200);
    });

    it("returns 404 when no default profile", async () => {
      mockGetDefault.mockResolvedValue(null);
      const res = await app.fetch(makeRequest("/default"));
      expect(res.status).toBe(404);
    });

    it("returns 500 on error", async () => {
      mockGetDefault.mockRejectedValue(new Error("db error"));
      const res = await app.fetch(makeRequest("/default"));
      expect(res.status).toBe(500);
    });
  });

  // ---- POST / ----
  describe("POST /", () => {
    it("creates a new profile", async () => {
      mockCreate.mockResolvedValue(mockProfile);
      const res = await app.fetch(makeRequest("/", "POST", {
        name: "Test Agent",
        description: "A test agent",
      }));
      expect(res.status).toBe(201);
      const json = (await res.json()) as { data: typeof mockProfile };
      expect(json.data.name).toBe("Test Agent");
    });

    it("creates profile with all optional fields", async () => {
      mockCreate.mockResolvedValue(mockProfile);
      const res = await app.fetch(makeRequest("/", "POST", {
        name: "Full Agent",
        description: "desc",
        skills: ["skill1"],
        tools: ["tool1"],
        knowledgeScopes: ["scope1"],
        permissions: ["read"],
        memoryScopes: ["workspace"],
        modelPolicy: { preferredModels: ["claude-4"], temperature: 0.7 },
        executorPolicy: { executor: "claude-code" },
        isDefault: true,
      }));
      expect(res.status).toBe(201);
    });

    it("ignores non-string description in create (validates only in update)", async () => {
      mockCreate.mockResolvedValue(mockProfile);
      const res = await app.fetch(makeRequest("/", "POST", {
        name: "Test",
        description: 123,
      }));
      expect(res.status).toBe(201);
    });

    it("rejects non-array knowledgeScopes", async () => {
      const res = await app.fetch(makeRequest("/", "POST", {
        name: "Test",
        knowledgeScopes: "not-array",
      }));
      expect(res.status).toBe(400);
    });

    it("rejects non-array permissions", async () => {
      const res = await app.fetch(makeRequest("/", "POST", {
        name: "Test",
        permissions: "not-array",
      }));
      expect(res.status).toBe(400);
    });

    it("rejects non-array memoryScopes", async () => {
      const res = await app.fetch(makeRequest("/", "POST", {
        name: "Test",
        memoryScopes: "not-array",
      }));
      expect(res.status).toBe(400);
    });

    it("returns 500 on create error", async () => {
      mockCreate.mockRejectedValue(new Error("db error"));
      const res = await app.fetch(makeRequest("/", "POST", { name: "Test" }));
      expect(res.status).toBe(500);
    });
  });

  // ---- GET /:id ----
  describe("GET /:id", () => {
    it("returns profile by id", async () => {
      mockGetById.mockResolvedValue(mockProfile);
      const res = await app.fetch(makeRequest("/profile-1"));
      expect(res.status).toBe(200);
    });

    it("returns 404 when not found", async () => {
      mockGetById.mockResolvedValue(null);
      const res = await app.fetch(makeRequest("/nonexistent"));
      expect(res.status).toBe(404);
    });

    it("returns 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("db error"));
      const res = await app.fetch(makeRequest("/profile-1"));
      expect(res.status).toBe(500);
    });
  });

  // ---- PATCH /:id ----
  describe("PATCH /:id", () => {
    it("updates a profile", async () => {
      mockGetById.mockResolvedValue(mockProfile);
      mockUpdate.mockResolvedValue({ ...mockProfile, name: "Updated" });
      const res = await app.fetch(makeRequest("/profile-1", "PATCH", { name: "Updated" }));
      expect(res.status).toBe(200);
    });

    it("returns 404 when not found", async () => {
      mockGetById.mockResolvedValue(null);
      const res = await app.fetch(makeRequest("/nonexistent", "PATCH", { name: "Updated" }));
      expect(res.status).toBe(404);
    });

    it("clears description with null", async () => {
      mockGetById.mockResolvedValue(mockProfile);
      mockUpdate.mockResolvedValue(mockProfile);
      const res = await app.fetch(makeRequest("/profile-1", "PATCH", { description: null }));
      expect(res.status).toBe(200);
    });

    it("updates modelPolicy with valid shape", async () => {
      mockGetById.mockResolvedValue(mockProfile);
      mockUpdate.mockResolvedValue(mockProfile);
      const res = await app.fetch(makeRequest("/profile-1", "PATCH", {
        modelPolicy: { preferredModels: ["claude-4"], temperature: 0.5 },
      }));
      expect(res.status).toBe(200);
    });

    it("clears modelPolicy with null", async () => {
      mockGetById.mockResolvedValue(mockProfile);
      mockUpdate.mockResolvedValue(mockProfile);
      const res = await app.fetch(makeRequest("/profile-1", "PATCH", { modelPolicy: null }));
      expect(res.status).toBe(200);
    });

    it("updates executorPolicy with valid shape", async () => {
      mockGetById.mockResolvedValue(mockProfile);
      mockUpdate.mockResolvedValue(mockProfile);
      const res = await app.fetch(makeRequest("/profile-1", "PATCH", {
        executorPolicy: { executor: "opencode", workDir: "/tmp" },
      }));
      expect(res.status).toBe(200);
    });

    it("rejects non-array skills in update", async () => {
      const res = await app.fetch(makeRequest("/profile-1", "PATCH", { skills: "not-array" }));
      expect(res.status).toBe(400);
    });

    it("rejects non-array tools in update", async () => {
      const res = await app.fetch(makeRequest("/profile-1", "PATCH", { tools: "not-array" }));
      expect(res.status).toBe(400);
    });

    it("rejects non-array knowledgeScopes in update", async () => {
      const res = await app.fetch(makeRequest("/profile-1", "PATCH", { knowledgeScopes: "not-array" }));
      expect(res.status).toBe(400);
    });

    it("rejects non-array permissions in update", async () => {
      const res = await app.fetch(makeRequest("/profile-1", "PATCH", { permissions: "not-array" }));
      expect(res.status).toBe(400);
    });

    it("rejects non-array memoryScopes in update", async () => {
      const res = await app.fetch(makeRequest("/profile-1", "PATCH", { memoryScopes: "not-array" }));
      expect(res.status).toBe(400);
    });

    it("rejects non-boolean isDefault in update", async () => {
      const res = await app.fetch(makeRequest("/profile-1", "PATCH", { isDefault: "yes" }));
      expect(res.status).toBe(400);
    });

    it("returns 500 on update error", async () => {
      mockGetById.mockResolvedValue(mockProfile);
      mockUpdate.mockRejectedValue(new Error("db error"));
      const res = await app.fetch(makeRequest("/profile-1", "PATCH", { name: "Updated" }));
      expect(res.status).toBe(500);
    });
  });

  // ---- DELETE /:id ----
  describe("DELETE /:id", () => {
    it("deletes a non-default profile", async () => {
      mockGetById.mockResolvedValue(mockProfile);
      mockDelete.mockResolvedValue(undefined);
      const res = await app.fetch(makeRequest("/profile-1", "DELETE"));
      expect(res.status).toBe(200);
    });

    it("returns 404 when not found", async () => {
      mockGetById.mockResolvedValue(null);
      const res = await app.fetch(makeRequest("/nonexistent", "DELETE"));
      expect(res.status).toBe(404);
    });

    it("returns 400 when trying to delete default profile", async () => {
      mockGetById.mockResolvedValue({ ...mockProfile, isDefault: true });
      const res = await app.fetch(makeRequest("/profile-1", "DELETE"));
      expect(res.status).toBe(400);
    });

    it("returns 500 on delete error", async () => {
      mockGetById.mockResolvedValue(mockProfile);
      mockDelete.mockRejectedValue(new Error("db error"));
      const res = await app.fetch(makeRequest("/profile-1", "DELETE"));
      expect(res.status).toBe(500);
    });
  });

  // ---- POST /:id/set-default ----
  describe("POST /:id/set-default", () => {
    it("sets a profile as default", async () => {
      mockGetById.mockResolvedValue(mockProfile);
      mockGetAll.mockResolvedValue([
        { ...mockProfile, isDefault: true },
        { ...mockProfile, id: "profile-2", isDefault: false },
      ]);
      mockUpdate.mockResolvedValue({ ...mockProfile, isDefault: true });
      const res = await app.fetch(makeRequest("/profile-1/set-default", "POST"));
      expect(res.status).toBe(200);
    });

    it("returns 404 when profile not found", async () => {
      mockGetById.mockResolvedValue(null);
      const res = await app.fetch(makeRequest("/nonexistent/set-default", "POST"));
      expect(res.status).toBe(404);
    });

    it("returns 500 on error", async () => {
      mockGetById.mockRejectedValue(new Error("db error"));
      const res = await app.fetch(makeRequest("/profile-1/set-default", "POST"));
      expect(res.status).toBe(500);
    });
  });
});
