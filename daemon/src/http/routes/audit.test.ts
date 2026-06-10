import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockQuery, mockCount } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockCount: vi.fn(),
}));

vi.mock("../../persistence/factory.js", () => ({
  getRepositories: () => ({
    auditLog: {
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

import app from "./audit.js";

function makeRequest(path: string) {
  return new Request(`http://localhost${path}`, { method: "GET" });
}

describe("audit route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET / returns audit entries with count", async () => {
    mockQuery.mockResolvedValue([{ id: "a1", action: "login" }]);
    mockCount.mockResolvedValue(1);

    const res = await app.fetch(makeRequest("/"));
    const json = (await res.json()) as { entries: unknown[]; total: number; count: number };

    expect(res.status).toBe(200);
    expect(json.entries).toHaveLength(1);
    expect(json.total).toBe(1);
    expect(json.count).toBe(1);
  });

  it("passes query filters to repo", async () => {
    mockQuery.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await app.fetch(makeRequest("/?actor=admin&action=delete&riskLevel=high&limit=20&offset=10"));

    expect(mockQuery).toHaveBeenCalledWith({
      actor: "admin",
      action: "delete",
      riskLevel: "high",
      since: undefined,
      limit: 20,
      offset: 10,
    });
  });

  it("converts numeric string params to numbers", async () => {
    mockQuery.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await app.fetch(makeRequest("/?limit=5&offset=2"));

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5, offset: 2 }),
    );
  });

  it("returns empty when no entries", async () => {
    mockQuery.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    const res = await app.fetch(makeRequest("/"));
    const json = (await res.json()) as { entries: unknown[]; count: number };

    expect(json.entries).toHaveLength(0);
    expect(json.count).toBe(0);
  });

  it("returns 500 on repo error", async () => {
    mockQuery.mockRejectedValue(new Error("db failure"));

    const res = await app.fetch(makeRequest("/"));
    expect(res.status).toBe(500);
  });
});
