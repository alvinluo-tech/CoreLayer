import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockQuery, mockGetById, mockCreate, mockUpdate, mockDelete, mockGetByProjectId, mockDecomposeTask, mockEnqueue, mockSetDependencies, mockCanExecute, mockCompleteTask, mockGetExecutableTasks, mockDetectCycles, mockGetRecent } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockGetById: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockGetByProjectId: vi.fn(),
  mockDecomposeTask: vi.fn(),
  mockEnqueue: vi.fn(),
  mockSetDependencies: vi.fn(),
  mockCanExecute: vi.fn(),
  mockCompleteTask: vi.fn(),
  mockGetExecutableTasks: vi.fn(),
  mockDetectCycles: vi.fn(),
  mockGetRecent: vi.fn(),
}));

vi.mock("../../persistence/factory.js", () => ({
  getRepositories: () => ({
    tasks: {
      query: (...args: unknown[]) => mockQuery(...args),
      getById: (...args: unknown[]) => mockGetById(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
      getByProjectId: (...args: unknown[]) => mockGetByProjectId(...args),
    },
    agentRuns: {
      getRecent: (...args: unknown[]) => mockGetRecent(...args),
    },
  }),
}));

vi.mock("../../workspaces/task-graph-service.js", () => ({
  TaskGraph: vi.fn().mockImplementation(() => ({
    setDependencies: (...args: unknown[]) => mockSetDependencies(...args),
    canExecute: (...args: unknown[]) => mockCanExecute(...args),
    completeTask: (...args: unknown[]) => mockCompleteTask(...args),
    getExecutableTasks: (...args: unknown[]) => mockGetExecutableTasks(...args),
    detectCycles: (...args: unknown[]) => mockDetectCycles(...args),
  })),
}));

vi.mock("../../runtimes/agent/public-api.js", () => ({
  decomposeTask: (...args: unknown[]) => mockDecomposeTask(...args),
}));

vi.mock("../../workflow/queue-service.js", () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
}));

vi.mock("../../shared/errors.js", () => ({
  apiError: vi.fn((_c: unknown, message: string, status = 500) =>
    new Response(JSON.stringify({ error: message }), { status }),
  ),
  extractErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  logError: vi.fn(),
  ErrorCodes: { NOT_FOUND: "NOT_FOUND", VALIDATION: "VALIDATION" },
}));

import app from "./tasks.js";

function makeRequest(path: string, method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`http://localhost${path}`, init);
}

describe("tasks route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockGetById.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "t1", title: "Task" });
    mockUpdate.mockResolvedValue({ id: "t1", title: "Updated" });
    mockDelete.mockResolvedValue(undefined);
    mockGetByProjectId.mockResolvedValue([]);
    mockDecomposeTask.mockResolvedValue({ tasks: [] });
    mockEnqueue.mockResolvedValue({ runId: "r1", id: "e1" });
    mockSetDependencies.mockResolvedValue(undefined);
    mockCanExecute.mockResolvedValue(true);
    mockCompleteTask.mockResolvedValue(undefined);
    mockGetExecutableTasks.mockResolvedValue([]);
    mockDetectCycles.mockResolvedValue([]);
    mockGetRecent.mockResolvedValue([]);
  });

  describe("GET /", () => {
    it("returns tasks with count", async () => {
      mockQuery.mockResolvedValue([{ id: "t1", title: "Task 1" }]);

      const res = await app.fetch(makeRequest("/"));
      const json = (await res.json()) as { tasks: unknown[]; count: number };

      expect(res.status).toBe(200);
      expect(json.tasks).toHaveLength(1);
      expect(json.count).toBe(1);
    });

    it("passes filters", async () => {
      mockQuery.mockResolvedValue([]);

      await app.fetch(makeRequest("/?status=pending&priority=1&projectId=p1"));

      expect(mockQuery).toHaveBeenCalledWith({
        status: "pending",
        priority: 1,
        projectId: "p1",
      });
    });
  });

  describe("POST /", () => {
    it("creates task with valid title", async () => {
      const res = await app.fetch(
        makeRequest("/", "POST", { title: "New Task", priority: 1 }),
      );
      const json = (await res.json()) as { task: { id: string } };

      expect(res.status).toBe(201);
      expect(json.task.id).toBe("t1");
    });

    it("returns 400 when title is missing", async () => {
      const res = await app.fetch(makeRequest("/", "POST", {}));
      expect(res.status).toBe(400);
    });
  });

  describe("GET /:id", () => {
    it("returns task by id", async () => {
      mockGetById.mockResolvedValue({ id: "t1", title: "Task" });

      const res = await app.fetch(makeRequest("/t1"));
      const json = (await res.json()) as { task: { id: string } };

      expect(res.status).toBe(200);
      expect(json.task.id).toBe("t1");
    });

    it("returns 404 when not found", async () => {
      const res = await app.fetch(makeRequest("/nonexistent"));
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /:id", () => {
    it("updates a task", async () => {
      const res = await app.fetch(
        makeRequest("/t1", "PATCH", { title: "Updated" }),
      );
      const json = (await res.json()) as { task: { title: string } };

      expect(res.status).toBe(200);
      expect(json.task.title).toBe("Updated");
    });

    it("returns 404 on not found error", async () => {
      mockUpdate.mockRejectedValue(new Error("Task not found"));

      const res = await app.fetch(
        makeRequest("/nonexistent", "PATCH", { title: "X" }),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /:id", () => {
    it("deletes a task", async () => {
      const res = await app.fetch(makeRequest("/t1", "DELETE"));
      const json = (await res.json()) as { success: boolean };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });
  });

  describe("GET /project/:projectId", () => {
    it("returns tasks for a project", async () => {
      mockGetByProjectId.mockResolvedValue([{ id: "t1" }]);

      const res = await app.fetch(makeRequest("/project/p1"));
      const json = (await res.json()) as { tasks: unknown[] };

      expect(res.status).toBe(200);
      expect(json.tasks).toHaveLength(1);
    });
  });

  describe("POST /:id/dependencies", () => {
    it("sets dependencies", async () => {
      mockGetById.mockResolvedValue({ id: "t1", dependencies: ["t0"] });

      const res = await app.fetch(
        makeRequest("/t1/dependencies", "POST", { dependencies: ["t0"] }),
      );
      const json = (await res.json()) as { task: { id: string } };

      expect(res.status).toBe(200);
      expect(json.task.id).toBe("t1");
    });
  });

  describe("GET /:id/can-execute", () => {
    it("checks if task can execute", async () => {
      mockCanExecute.mockResolvedValue(true);

      const res = await app.fetch(makeRequest("/t1/can-execute"));
      const json = (await res.json()) as { canExecute: boolean };

      expect(res.status).toBe(200);
      expect(json.canExecute).toBe(true);
    });
  });

  describe("POST /:id/complete", () => {
    it("completes a task", async () => {
      mockGetById.mockResolvedValue({ id: "t1" });

      const res = await app.fetch(makeRequest("/t1/complete", "POST"));
      const json = (await res.json()) as { task: { id: string } };

      expect(res.status).toBe(200);
      expect(json.task.id).toBe("t1");
    });
  });

  describe("GET /project/:projectId/executable", () => {
    it("returns executable tasks", async () => {
      mockGetExecutableTasks.mockResolvedValue([{ id: "t1" }]);

      const res = await app.fetch(makeRequest("/project/p1/executable"));
      const json = (await res.json()) as { tasks: unknown[]; count: number };

      expect(res.status).toBe(200);
      expect(json.tasks).toHaveLength(1);
      expect(json.count).toBe(1);
    });
  });

  describe("GET /project/:projectId/cycles", () => {
    it("detects cycles", async () => {
      mockDetectCycles.mockResolvedValue([["t1", "t2"]]);

      const res = await app.fetch(makeRequest("/project/p1/cycles"));
      const json = (await res.json()) as { cycles: unknown[][]; hasCycles: boolean };

      expect(res.status).toBe(200);
      expect(json.hasCycles).toBe(true);
      expect(json.cycles).toHaveLength(1);
    });

    it("reports no cycles", async () => {
      mockDetectCycles.mockResolvedValue([]);

      const res = await app.fetch(makeRequest("/project/p1/cycles"));
      const json = (await res.json()) as { hasCycles: boolean };

      expect(json.hasCycles).toBe(false);
    });
  });

  describe("POST /decompose", () => {
    it("decomposes a task with AI", async () => {
      mockDecomposeTask.mockResolvedValue({ tasks: [{ title: "Subtask 1" }] });

      const res = await app.fetch(
        makeRequest("/decompose", "POST", { objective: "Build feature", projectId: "p1" }),
      );
      const json = (await res.json()) as { tasks: unknown[] };

      expect(res.status).toBe(201);
      expect(json.tasks).toHaveLength(1);
    });

    it("returns 400 when objective is missing", async () => {
      const res = await app.fetch(
        makeRequest("/decompose", "POST", { projectId: "p1" }),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("POST /:id/start", () => {
    it("enqueues a task for execution", async () => {
      mockGetById.mockResolvedValue({ id: "t1", assignedAgentId: "a1", workspaceId: "ws1", projectId: "p1" });

      const res = await app.fetch(makeRequest("/t1/start", "POST"));
      const json = (await res.json()) as { success: boolean; runId: string };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.runId).toBe("r1");
    });

    it("returns 404 when task not found", async () => {
      mockGetById.mockResolvedValue(null);

      const res = await app.fetch(makeRequest("/nonexistent/start", "POST"));
      expect(res.status).toBe(404);
    });
  });

  describe("POST /:id/cancel", () => {
    it("cancels active run for a task", async () => {
      mockGetById.mockResolvedValue({ id: "t1" });
      mockGetRecent.mockResolvedValue([
        { id: "r1", taskId: "t1", status: "running" },
      ]);

      vi.doMock("../../workflow/run-dispatcher.js", () => ({
        cancelRun: vi.fn().mockResolvedValue(true),
      }));

      const res = await app.fetch(makeRequest("/t1/cancel", "POST"));
      const json = (await res.json()) as { success: boolean };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("returns 404 when task not found", async () => {
      mockGetById.mockResolvedValue(null);

      const res = await app.fetch(makeRequest("/nonexistent/cancel", "POST"));
      expect(res.status).toBe(404);
    });

    it("returns 400 when no active run", async () => {
      mockGetById.mockResolvedValue({ id: "t1" });
      mockGetRecent.mockResolvedValue([]);

      const res = await app.fetch(makeRequest("/t1/cancel", "POST"));
      expect(res.status).toBe(400);
    });
  });
});
