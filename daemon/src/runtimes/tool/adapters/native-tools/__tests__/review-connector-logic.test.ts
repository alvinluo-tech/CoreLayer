import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture registered tools
const registeredTools = new Map<string, unknown>();

vi.mock("../registry.js", () => ({
  registerTool: vi.fn((name: string, toolDef: unknown) => {
    registeredTools.set(name, toolDef);
  }),
}));

const mockGetDailySummary = vi.fn();
const mockGetWeeklyStats = vi.fn();
const mockSaveReview = vi.fn();
const mockGetHistory = vi.fn();

vi.mock("../../../../../persistence/factory.js", () => ({
  getRepositories: () => ({
    reviews: {
      getDailySummary: mockGetDailySummary,
      getWeeklyStats: mockGetWeeklyStats,
      save: mockSaveReview,
      getHistory: mockGetHistory,
    },
  }),
}));

const { registerReviewTools } = await import("../review/connector.js");

function getToolExecute(name: string): (...args: unknown[]) => Promise<unknown> {
  const tool = registeredTools.get(name) as { execute: (...args: unknown[]) => Promise<unknown> };
  return tool.execute;
}

describe("review-connector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredTools.clear();
    registerReviewTools();
  });

  it("registers all review tools", () => {
    expect(registeredTools.has("getDailySummary")).toBe(true);
    expect(registeredTools.has("getWeeklyStats")).toBe(true);
    expect(registeredTools.has("saveReview")).toBe(true);
    expect(registeredTools.has("getReviewHistory")).toBe(true);
  });

  describe("getDailySummary", () => {
    it("returns daily summary for default date", async () => {
      const summary = { tasksCompleted: 5, tasksTotal: 8, completionRate: 62 };
      mockGetDailySummary.mockResolvedValueOnce(summary);

      const execute = getToolExecute("getDailySummary");
      const result = await execute({});

      expect(mockGetDailySummary).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(summary);
    });

    it("returns daily summary for specific date", async () => {
      const summary = { tasksCompleted: 3, tasksTotal: 3, completionRate: 100 };
      mockGetDailySummary.mockResolvedValueOnce(summary);

      const execute = getToolExecute("getDailySummary");
      const result = await execute({ date: "2024-06-15" });

      expect(mockGetDailySummary).toHaveBeenCalledWith("2024-06-15");
      expect(result).toEqual(summary);
    });
  });

  describe("getWeeklyStats", () => {
    it("returns weekly stats for default week", async () => {
      const stats = { tasksCompleted: 20, tasksTotal: 30, completionRate: 67 };
      mockGetWeeklyStats.mockResolvedValueOnce(stats);

      const execute = getToolExecute("getWeeklyStats");
      const result = await execute({});

      expect(mockGetWeeklyStats).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(stats);
    });

    it("returns weekly stats for specific week", async () => {
      const stats = { tasksCompleted: 10, tasksTotal: 10, completionRate: 100 };
      mockGetWeeklyStats.mockResolvedValueOnce(stats);

      const execute = getToolExecute("getWeeklyStats");
      const result = await execute({ weekStart: "2024-06-10" });

      expect(mockGetWeeklyStats).toHaveBeenCalledWith("2024-06-10");
      expect(result).toEqual(stats);
    });
  });

  describe("saveReview", () => {
    it("saves a review", async () => {
      const review = { id: "r1", type: "daily", summary: "Good day" };
      mockSaveReview.mockResolvedValueOnce(review);

      const execute = getToolExecute("saveReview");
      const result = await execute({
        type: "daily",
        summary: "Good day",
        patterns: ["focused morning"],
        suggestions: ["take breaks"],
      });

      expect(mockSaveReview).toHaveBeenCalledWith({
        type: "daily",
        summary: "Good day",
        patterns: ["focused morning"],
        suggestions: ["take breaks"],
      });
      expect(result).toEqual({ review });
    });
  });

  describe("getReviewHistory", () => {
    it("returns review history", async () => {
      const reviews = [
        { id: "r1", type: "daily", summary: "Day 1" },
        { id: "r2", type: "daily", summary: "Day 2" },
      ];
      mockGetHistory.mockResolvedValueOnce(reviews);

      const execute = getToolExecute("getReviewHistory");
      const result = await execute({ type: "daily", limit: 10 });

      expect(mockGetHistory).toHaveBeenCalledWith("daily", 10);
      expect(result).toEqual({ reviews });
    });

    it("returns empty history", async () => {
      mockGetHistory.mockResolvedValueOnce([]);

      const execute = getToolExecute("getReviewHistory");
      const result = await execute({ type: "weekly", limit: 5 });

      expect(result).toEqual({ reviews: [] });
    });
  });
});
