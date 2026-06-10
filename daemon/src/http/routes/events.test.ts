import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockQuery, mockCount } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockCount: vi.fn(),
}));

vi.mock("../../persistence/factory.js", () => ({
  getRepositories: () => ({
    eventLog: {
      query: (...args: unknown[]) => mockQuery(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
  }),
}));

vi.mock("../../shared/errors.js", () => ({
  apiError: vi.fn((_c: unknown, message: string, status = 500) =>
    new Response(JSON.stringify({ error: message }), { status }),
  ),
  extractErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  logError: vi.fn(),
}));

import app from "./events.js";

function makeRequest(path: string, method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`http://localhost${path}`, init);
}

describe("events route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET / returns events with count", async () => {
    mockQuery.mockResolvedValue([{ id: "e1", type: "test" }]);
    mockCount.mockResolvedValue(1);

    const res = await app.fetch(makeRequest("/"));
    const json = (await res.json()) as { events: unknown[]; total: number; count: number };

    expect(res.status).toBe(200);
    expect(json.events).toHaveLength(1);
    expect(json.total).toBe(1);
    expect(json.count).toBe(1);
  });

  it("GET / returns empty array when no events", async () => {
    mockQuery.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    const res = await app.fetch(makeRequest("/"));
    const json = (await res.json()) as { events: unknown[]; total: number; count: number };

    expect(res.status).toBe(200);
    expect(json.events).toHaveLength(0);
    expect(json.count).toBe(0);
  });

  it("passes query filters to repo", async () => {
    mockQuery.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await app.fetch(makeRequest("/?type=error&projectId=p1&limit=10&offset=5"));

    expect(mockQuery).toHaveBeenCalledWith({
      type: "error",
      projectId: "p1",
      agentRunId: undefined,
      runtimeId: undefined,
      since: undefined,
      limit: 10,
      offset: 5,
    });
  });

  it("returns 500 on repo error", async () => {
    mockQuery.mockRejectedValue(new Error("db failure"));

    const res = await app.fetch(makeRequest("/"));
    expect(res.status).toBe(500);
  });
});
