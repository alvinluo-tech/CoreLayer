import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockGetDailySummary, mockGetWeeklyStats } = vi.hoisted(() => ({
  mockGetDailySummary: vi.fn(),
  mockGetWeeklyStats: vi.fn(),
}));

vi.mock("../../../persistence/factory.js", () => ({
  getRepositories: () => ({
    reviews: {
      getDailySummary: (...args: unknown[]) => mockGetDailySummary(...args),
      getWeeklyStats: (...args: unknown[]) => mockGetWeeklyStats(...args),
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

import app from "../reviews.js";

function makeRequest(path: string) {
  return new Request(`http://localhost${path}`, { method: "GET" });
}

describe("reviews route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /daily-summary returns summary data", async () => {
    mockGetDailySummary.mockResolvedValue({ date: "2026-01-01", completion: 0.8 });

    const res = await app.fetch(makeRequest("/daily-summary"));
    const json = (await res.json()) as { date: string; completion: number };

    expect(res.status).toBe(200);
    expect(json.date).toBe("2026-01-01");
    expect(mockGetDailySummary).toHaveBeenCalledWith(undefined);
  });

  it("GET /daily-summary passes date query param", async () => {
    mockGetDailySummary.mockResolvedValue({ date: "2026-06-01" });

    await app.fetch(makeRequest("/daily-summary?date=2026-06-01"));

    expect(mockGetDailySummary).toHaveBeenCalledWith("2026-06-01");
  });

  it("GET /weekly-stats returns stats", async () => {
    mockGetWeeklyStats.mockResolvedValue({ week: "2026-W23", tasks: 12 });

    const res = await app.fetch(makeRequest("/weekly-stats"));
    const json = (await res.json()) as { week: string; tasks: number };

    expect(res.status).toBe(200);
    expect(json.week).toBe("2026-W23");
    expect(mockGetWeeklyStats).toHaveBeenCalledWith(undefined);
  });

  it("GET /weekly-stats passes weekStart query param", async () => {
    mockGetWeeklyStats.mockResolvedValue({});

    await app.fetch(makeRequest("/weekly-stats?weekStart=2026-06-01"));

    expect(mockGetWeeklyStats).toHaveBeenCalledWith("2026-06-01");
  });

  it("returns 500 on daily-summary error", async () => {
    mockGetDailySummary.mockRejectedValue(new Error("db error"));

    const res = await app.fetch(makeRequest("/daily-summary"));
    expect(res.status).toBe(500);
  });

  it("returns 500 on weekly-stats error", async () => {
    mockGetWeeklyStats.mockRejectedValue(new Error("db error"));

    const res = await app.fetch(makeRequest("/weekly-stats"));
    expect(res.status).toBe(500);
  });
});
