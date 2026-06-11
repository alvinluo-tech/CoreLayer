import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockGetAll, mockUpsert, mockUpdate, mockDelete, mockUpdateLastRun, mockTriggerTask, mockComputeNextRun, mockParseNlTimeToCron } = vi.hoisted(() => ({
  mockGetAll: vi.fn(),
  mockUpsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockUpdateLastRun: vi.fn(),
  mockTriggerTask: vi.fn(),
  mockComputeNextRun: vi.fn(),
  mockParseNlTimeToCron: vi.fn(),
}));

vi.mock("../../../persistence/factory.js", () => ({
  getRepositories: () => ({
    scheduledTasks: {
      getAll: (...args: unknown[]) => mockGetAll(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
      updateLastRun: (...args: unknown[]) => mockUpdateLastRun(...args),
    },
  }),
}));

vi.mock("../../../runtimes/scheduler/public-api.js", () => ({
  triggerTask: (...args: unknown[]) => mockTriggerTask(...args),
  computeNextRun: (...args: unknown[]) => mockComputeNextRun(...args),
}));

vi.mock("../../../shared/time/parse-nl-time.js", () => ({
  parseNlTimeToCron: (...args: unknown[]) => mockParseNlTimeToCron(...args),
}));

vi.mock("../../../shared/errors.js", () => ({
  apiError: vi.fn((_c: unknown, message: string, status = 500) =>
    new Response(JSON.stringify({ error: message }), { status }),
  ),
  extractErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  logError: vi.fn(),
}));

import app from "../scheduled-tasks.js";

function makeRequest(path: string, method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`http://localhost${path}`, init);
}

describe("scheduled-tasks route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([]);
    mockUpsert.mockResolvedValue({ id: "st-1", name: "Test", lastRun: "" });
    mockUpdate.mockResolvedValue({ id: "st-1", name: "Updated" });
    mockDelete.mockResolvedValue(true);
    mockComputeNextRun.mockReturnValue("2026-06-11T00:00:00Z");
    mockTriggerTask.mockResolvedValue({ id: "st-1" });
  });

  describe("GET /", () => {
    it("returns all scheduled tasks", async () => {
      mockGetAll.mockResolvedValue([{ id: "st-1", name: "Daily" }]);

      const res = await app.fetch(makeRequest("/"));
      const json = (await res.json()) as { tasks: unknown[]; count: number };

      expect(res.status).toBe(200);
      expect(json.tasks).toHaveLength(1);
      expect(json.count).toBe(1);
    });
  });

  describe("POST /", () => {
    it("creates task with valid cron expression", async () => {
      const res = await app.fetch(
        makeRequest("/", "POST", { name: "Daily", cronExpr: "0 9 * * *", prompt: "Do something" }),
      );
      const json = (await res.json()) as { task: { id: string } };

      expect(res.status).toBe(201);
      expect(json.task.id).toBe("st-1");
    });

    it("returns 400 when name is missing", async () => {
      const res = await app.fetch(
        makeRequest("/", "POST", { cronExpr: "0 9 * * *", prompt: "Do something" }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when cronExpr is missing", async () => {
      const res = await app.fetch(
        makeRequest("/", "POST", { name: "Task", prompt: "Do something" }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when neither prompt nor skillName", async () => {
      const res = await app.fetch(
        makeRequest("/", "POST", { name: "Task", cronExpr: "0 9 * * *" }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 on invalid cron expression", async () => {
      mockComputeNextRun.mockImplementation(() => {
        throw new Error("bad cron");
      });

      const res = await app.fetch(
        makeRequest("/", "POST", { name: "Task", cronExpr: "invalid", prompt: "Do" }),
      );
      expect(res.status).toBe(400);
    });

    it("parses NL time to cron", async () => {
      mockParseNlTimeToCron.mockReturnValue("0 9 * * 1");
      mockComputeNextRun.mockReturnValue("2026-06-16T09:00:00Z");

      const res = await app.fetch(
        makeRequest("/", "POST", { name: "Task", cronExpr: "every Monday at 9am", prompt: "Do" }),
      );
      expect(res.status).toBe(201);
      expect(mockParseNlTimeToCron).toHaveBeenCalledWith("every Monday at 9am");
    });
  });

  describe("PUT /:id", () => {
    it("updates a scheduled task", async () => {
      const res = await app.fetch(
        makeRequest("/st-1", "PUT", { name: "Updated" }),
      );
      const json = (await res.json()) as { task: { name: string } };

      expect(res.status).toBe(200);
      expect(json.task.name).toBe("Updated");
    });

    it("returns 404 when not found", async () => {
      mockUpdate.mockRejectedValue(new Error("Scheduled task not found"));

      const res = await app.fetch(
        makeRequest("/nonexistent", "PUT", { name: "X" }),
      );
      expect(res.status).toBe(404);
    });

    it("returns 400 on invalid cron in update", async () => {
      mockComputeNextRun.mockImplementation(() => {
        throw new Error("bad cron");
      });

      const res = await app.fetch(
        makeRequest("/st-1", "PUT", { cronExpr: "bad" }),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /:id", () => {
    it("deletes a scheduled task", async () => {
      const res = await app.fetch(makeRequest("/st-1", "DELETE"));
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

  describe("POST /:id/trigger", () => {
    it("triggers a scheduled task", async () => {
      const res = await app.fetch(makeRequest("/st-1/trigger", "POST"));
      const json = (await res.json()) as { result: { id: string } };

      expect(res.status).toBe(200);
      expect(json.result.id).toBe("st-1");
    });

    it("returns 404 when not found", async () => {
      mockTriggerTask.mockResolvedValue(null);

      const res = await app.fetch(makeRequest("/nonexistent/trigger", "POST"));
      expect(res.status).toBe(404);
    });
  });
});
