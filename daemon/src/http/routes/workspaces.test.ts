import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockGetByOwnerId, mockGetDefault, mockCreate, mockGetById, mockUpdate, mockDelete, mockGetWorkspaceDetail, mockOrchestrateFromGoal, mockDbInsert, mockDbDelete, mockDbSelect } = vi.hoisted(() => ({
  mockGetByOwnerId: vi.fn(),
  mockGetDefault: vi.fn(),
  mockCreate: vi.fn(),
  mockGetById: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockGetWorkspaceDetail: vi.fn(),
  mockOrchestrateFromGoal: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbDelete: vi.fn(),
  mockDbSelect: vi.fn(),
}));

vi.mock("../../persistence/factory.js", () => ({
  getRepositories: () => ({
    workspaces: {
      getByOwnerId: (...args: unknown[]) => mockGetByOwnerId(...args),
      getDefault: (...args: unknown[]) => mockGetDefault(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      getById: (...args: unknown[]) => mockGetById(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
    projects: {
      create: vi.fn().mockResolvedValue({ id: "proj-1" }),
    },
  }),
}));

vi.mock("../../services/workspace-detail.js", () => ({
  getWorkspaceDetail: (...args: unknown[]) => mockGetWorkspaceDetail(...args),
}));

vi.mock("../../services/workspace-orchestrator.js", () => ({
  orchestrateFromGoal: (...args: unknown[]) => mockOrchestrateFromGoal(...args),
}));

vi.mock("../../persistence/client.js", () => ({
  db: {
    insert: (...args: unknown[]) => mockDbInsert(...args),
    delete: (...args: unknown[]) => mockDbDelete(...args),
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
  schema: {
    workspaceAgents: { workspaceId: "workspaceId", agentProfileId: "agentProfileId" },
    artifacts: { workspaceId: "workspaceId" },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
}));

vi.mock("../../shared/errors.js", () => ({
  apiError: vi.fn((_c: unknown, message: string, status = 500) =>
    new Response(JSON.stringify({ error: message }), { status }),
  ),
  extractErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  logError: vi.fn(),
}));

import app from "./workspaces.js";

function makeRequest(path: string, method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`http://localhost${path}`, init);
}

describe("workspaces route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetByOwnerId.mockResolvedValue([]);
    mockGetDefault.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "ws-1", name: "Default Workspace" });
    mockGetById.mockResolvedValue(null);
    mockUpdate.mockResolvedValue({ id: "ws-1", name: "Updated" });
    mockDelete.mockResolvedValue(true);
    mockGetWorkspaceDetail.mockResolvedValue(null);
    mockOrchestrateFromGoal.mockResolvedValue({ workspace: { id: "ws-1" } });
    mockDbInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
    mockDbDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue([]),
        }),
      }),
    });
  });

  describe("GET /", () => {
    it("returns all workspaces", async () => {
      mockGetByOwnerId.mockResolvedValue([{ id: "ws-1", name: "WS" }]);

      const res = await app.fetch(makeRequest("/"));
      const json = (await res.json()) as { data: unknown[] };

      expect(res.status).toBe(200);
      expect(json.data).toHaveLength(1);
    });
  });

  describe("GET /default", () => {
    it("returns existing default workspace", async () => {
      mockGetDefault.mockResolvedValue({ id: "ws-default", name: "Default" });

      const res = await app.fetch(makeRequest("/default"));
      const json = (await res.json()) as { data: { id: string } };

      expect(res.status).toBe(200);
      expect(json.data.id).toBe("ws-default");
    });

    it("creates default workspace if none exists", async () => {
      mockGetDefault.mockResolvedValue(null);
      mockCreate.mockResolvedValue({ id: "ws-new", name: "Default Workspace" });

      const res = await app.fetch(makeRequest("/default"));
      const json = (await res.json()) as { data: { id: string } };

      expect(res.status).toBe(200);
      expect(json.data.id).toBe("ws-new");
    });
  });

  describe("POST /from-goal", () => {
    it("orchestrates from goal string", async () => {
      mockOrchestrateFromGoal.mockResolvedValue({ workspace: { id: "ws-1" } });

      const res = await app.fetch(
        makeRequest("/from-goal", "POST", { goal: "Build a todo app" }),
      );
      const json = (await res.json()) as { data: { workspace: { id: string } } };

      expect(res.status).toBe(201);
      expect(json.data.workspace.id).toBe("ws-1");
    });

    it("returns 400 when goal is empty", async () => {
      const res = await app.fetch(
        makeRequest("/from-goal", "POST", { goal: "" }),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("POST /", () => {
    it("creates workspace with default project", async () => {
      mockCreate.mockResolvedValue({ id: "ws-1", name: "My Workspace" });

      const res = await app.fetch(
        makeRequest("/", "POST", { name: "My Workspace", description: "Test" }),
      );
      const json = (await res.json()) as { data: { id: string } };

      expect(res.status).toBe(201);
      expect(json.data.id).toBe("ws-1");
    });
  });

  describe("GET /:id", () => {
    it("returns workspace by id", async () => {
      mockGetById.mockResolvedValue({ id: "ws-1", name: "WS" });

      const res = await app.fetch(makeRequest("/ws-1"));
      const json = (await res.json()) as { data: { id: string } };

      expect(res.status).toBe(200);
      expect(json.data.id).toBe("ws-1");
    });

    it("returns 404 when not found", async () => {
      const res = await app.fetch(makeRequest("/nonexistent"));
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /:id", () => {
    it("updates workspace", async () => {
      mockGetById.mockResolvedValue({ id: "ws-1" });
      mockUpdate.mockResolvedValue({ id: "ws-1", name: "Updated" });

      const res = await app.fetch(
        makeRequest("/ws-1", "PATCH", { name: "Updated" }),
      );
      const json = (await res.json()) as { data: { name: string } };

      expect(res.status).toBe(200);
      expect(json.data.name).toBe("Updated");
    });

    it("returns 404 when not found", async () => {
      const res = await app.fetch(
        makeRequest("/nonexistent", "PATCH", { name: "X" }),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /:id", () => {
    it("deletes workspace", async () => {
      mockDelete.mockResolvedValue(true);

      const res = await app.fetch(makeRequest("/ws-1", "DELETE"));
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

  describe("GET /:id/detail", () => {
    it("returns workspace detail", async () => {
      mockGetWorkspaceDetail.mockResolvedValue({ id: "ws-1", projects: [] });

      const res = await app.fetch(makeRequest("/ws-1/detail"));
      const json = (await res.json()) as { data: { id: string } };

      expect(res.status).toBe(200);
      expect(json.data.id).toBe("ws-1");
    });

    it("returns 404 when not found", async () => {
      mockGetWorkspaceDetail.mockResolvedValue(null);

      const res = await app.fetch(makeRequest("/nonexistent/detail"));
      expect(res.status).toBe(404);
    });
  });

  describe("POST /:id/agents", () => {
    it("adds agent to workspace", async () => {
      const valuesChain = vi.fn().mockResolvedValue(undefined);
      mockDbInsert.mockReturnValue({ values: valuesChain });

      const res = await app.fetch(
        makeRequest("/ws-1/agents", "POST", { agentProfileId: "ap-1", roleInWorkspace: "builder" }),
      );
      const json = (await res.json()) as { data: { workspaceId: string; agentProfileId: string } };

      expect(res.status).toBe(201);
      expect(json.data.workspaceId).toBe("ws-1");
      expect(json.data.agentProfileId).toBe("ap-1");
    });
  });

  describe("DELETE /:id/agents/:agentId", () => {
    it("removes agent from workspace", async () => {
      const whereChain = vi.fn().mockResolvedValue(undefined);
      mockDbDelete.mockReturnValue({ where: whereChain });

      const res = await app.fetch(makeRequest("/ws-1/agents/ap-1", "DELETE"));
      const json = (await res.json()) as { success: boolean };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });
  });

  describe("GET /:id/artifacts", () => {
    it("returns artifacts for workspace", async () => {
      const allChain = vi.fn().mockReturnValue([]);
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ all: allChain }),
        }),
      });

      const res = await app.fetch(makeRequest("/ws-1/artifacts"));
      const json = (await res.json()) as { data: unknown[] };

      expect(res.status).toBe(200);
      expect(json.data).toEqual([]);
    });
  });
});
