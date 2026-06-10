import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockGetQueue, mockGetQueueStatus, mockGetDispatcherStatus } = vi.hoisted(() => ({
  mockGetQueue: vi.fn(),
  mockGetQueueStatus: vi.fn(),
  mockGetDispatcherStatus: vi.fn(),
}));

vi.mock("../../workflow/queue-service.js", () => ({
  getQueue: (...args: unknown[]) => mockGetQueue(...args),
  getQueueStatus: (...args: unknown[]) => mockGetQueueStatus(...args),
}));

vi.mock("../../workflow/run-dispatcher.js", () => ({
  getDispatcherStatus: (...args: unknown[]) => mockGetDispatcherStatus(...args),
}));

vi.mock("../../shared/errors.js", () => ({
  apiError: vi.fn((_c: unknown, message: string, status = 500) =>
    new Response(JSON.stringify({ error: message }), { status }),
  ),
  extractErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  logError: vi.fn(),
}));

import app from "./queue.js";

function makeRequest(path: string, method = "GET") {
  return new Request(`http://localhost${path}`, { method });
}

describe("queue route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET / returns queue items", async () => {
    mockGetQueue.mockResolvedValue([{ id: "q1", status: "pending" }]);

    const res = await app.fetch(makeRequest("/"));
    const json = (await res.json()) as { data: unknown[] };

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
  });

  it("GET /status returns queue status", async () => {
    mockGetQueueStatus.mockResolvedValue({ pending: 3, running: 1 });

    const res = await app.fetch(makeRequest("/status"));
    const json = (await res.json()) as { data: { pending: number; running: number } };

    expect(res.status).toBe(200);
    expect(json.data.pending).toBe(3);
  });

  it("GET /resources returns dispatcher status", async () => {
    mockGetDispatcherStatus.mockReturnValue({ active: 2, max: 5 });

    const res = await app.fetch(makeRequest("/resources"));
    const json = (await res.json()) as { data: { active: number; max: number } };

    expect(res.status).toBe(200);
    expect(json.data.active).toBe(2);
  });

  it("returns 500 when getQueue fails", async () => {
    mockGetQueue.mockRejectedValue(new Error("queue error"));

    const res = await app.fetch(makeRequest("/"));
    expect(res.status).toBe(500);
  });

  it("returns 500 when getQueueStatus fails", async () => {
    mockGetQueueStatus.mockRejectedValue(new Error("status error"));

    const res = await app.fetch(makeRequest("/status"));
    expect(res.status).toBe(500);
  });

  it("returns 500 when getDispatcherStatus fails", async () => {
    mockGetDispatcherStatus.mockImplementation(() => {
      throw new Error("dispatcher error");
    });

    const res = await app.fetch(makeRequest("/resources"));
    expect(res.status).toBe(500);
  });
});
