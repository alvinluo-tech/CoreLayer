import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockGetRecent, mockGetById, mockGetByRunId, mockCancelRun, mockRetryRun } = vi.hoisted(() => ({
  mockGetRecent: vi.fn(),
  mockGetById: vi.fn(),
  mockGetByRunId: vi.fn(),
  mockCancelRun: vi.fn(),
  mockRetryRun: vi.fn(),
}));

vi.mock("../../persistence/factory.js", () => ({
  getRepositories: () => ({
    agentRuns: {
      getRecent: (...args: unknown[]) => mockGetRecent(...args),
      getById: (...args: unknown[]) => mockGetById(...args),
    },
    agentRunEvents: {
      getByRunId: (...args: unknown[]) => mockGetByRunId(...args),
    },
  }),
}));

vi.mock("../../workflow/run-dispatcher.js", () => ({
  cancelRun: (...args: unknown[]) => mockCancelRun(...args),
  retryRun: (...args: unknown[]) => mockRetryRun(...args),
}));

vi.mock("../../shared/errors.js", () => ({
  apiError: vi.fn((_c: unknown, message: string, status = 500) =>
    new Response(JSON.stringify({ error: message }), { status }),
  ),
  extractErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  logError: vi.fn(),
}));

import app from "./runs.js";

function makeRequest(path: string, method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`http://localhost${path}`, init);
}

describe("runs route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRecent.mockResolvedValue([]);
    mockGetById.mockResolvedValue(null);
    mockGetByRunId.mockResolvedValue([]);
    mockCancelRun.mockResolvedValue(true);
    mockRetryRun.mockResolvedValue(true);
  });

  describe("GET /", () => {
    it("returns recent runs", async () => {
      mockGetRecent.mockResolvedValue([{ id: "r1", status: "running" }]);

      const res = await app.fetch(makeRequest("/"));
      const json = (await res.json()) as { data: unknown[] };

      expect(res.status).toBe(200);
      expect(json.data).toHaveLength(1);
      expect(mockGetRecent).toHaveBeenCalledWith(50);
    });

    it("accepts custom limit", async () => {
      mockGetRecent.mockResolvedValue([]);

      await app.fetch(makeRequest("/?limit=10"));

      expect(mockGetRecent).toHaveBeenCalledWith(10);
    });
  });

  describe("GET /:id", () => {
    it("returns run by id", async () => {
      mockGetById.mockResolvedValue({ id: "r1", status: "completed" });

      const res = await app.fetch(makeRequest("/r1"));
      const json = (await res.json()) as { data: { id: string } };

      expect(res.status).toBe(200);
      expect(json.data.id).toBe("r1");
    });

    it("returns 404 when not found", async () => {
      mockGetById.mockResolvedValue(null);

      const res = await app.fetch(makeRequest("/nonexistent"));
      expect(res.status).toBe(404);
    });
  });

  describe("GET /:id/events", () => {
    it("returns events for a run", async () => {
      mockGetByRunId.mockResolvedValue([{ id: "e1", type: "delta" }]);

      const res = await app.fetch(makeRequest("/r1/events"));
      const json = (await res.json()) as { data: unknown[] };

      expect(res.status).toBe(200);
      expect(json.data).toHaveLength(1);
      expect(mockGetByRunId).toHaveBeenCalledWith("r1");
    });
  });

  describe("GET /:id/artifacts", () => {
    it("returns artifacts for a run", async () => {
      mockGetById.mockResolvedValue({ id: "r1", artifacts: [{ name: "file.txt" }] });

      const res = await app.fetch(makeRequest("/r1/artifacts"));
      const json = (await res.json()) as { data: unknown[] };

      expect(res.status).toBe(200);
      expect(json.data).toHaveLength(1);
    });

    it("returns 404 when run not found", async () => {
      mockGetById.mockResolvedValue(null);

      const res = await app.fetch(makeRequest("/nonexistent/artifacts"));
      expect(res.status).toBe(404);
    });

    it("returns empty array when no artifacts", async () => {
      mockGetById.mockResolvedValue({ id: "r1" });

      const res = await app.fetch(makeRequest("/r1/artifacts"));
      const json = (await res.json()) as { data: unknown[] };

      expect(json.data).toEqual([]);
    });
  });

  describe("POST /:id/cancel", () => {
    it("cancels a run", async () => {
      mockCancelRun.mockResolvedValue(true);

      const res = await app.fetch(makeRequest("/r1/cancel", "POST"));
      const json = (await res.json()) as { data: { cancelled: boolean } };

      expect(res.status).toBe(200);
      expect(json.data.cancelled).toBe(true);
    });

    it("returns 400 when cancel fails", async () => {
      mockCancelRun.mockResolvedValue(false);

      const res = await app.fetch(makeRequest("/r1/cancel", "POST"));
      expect(res.status).toBe(400);
    });
  });

  describe("POST /:id/retry", () => {
    it("retries a run", async () => {
      mockRetryRun.mockResolvedValue(true);

      const res = await app.fetch(makeRequest("/r1/retry", "POST"));
      const json = (await res.json()) as { data: { retried: boolean } };

      expect(res.status).toBe(200);
      expect(json.data.retried).toBe(true);
    });

    it("returns 400 when retry fails", async () => {
      mockRetryRun.mockResolvedValue(false);

      const res = await app.fetch(makeRequest("/r1/retry", "POST"));
      expect(res.status).toBe(400);
    });
  });
});
