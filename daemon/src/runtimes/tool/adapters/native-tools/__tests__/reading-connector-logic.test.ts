import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture registered tools
const registeredTools = new Map<string, unknown>();

vi.mock("../registry.js", () => ({
  registerTool: vi.fn((name: string, toolDef: unknown) => {
    registeredTools.set(name, toolDef);
  }),
}));

const mockCreateArticle = vi.fn();
const mockListArticles = vi.fn();
const mockUpdateArticle = vi.fn();

vi.mock("../../../../../persistence/factory.js", () => ({
  getRepositories: () => ({
    articles: {
      create: mockCreateArticle,
      list: mockListArticles,
      update: mockUpdateArticle,
    },
  }),
}));

const { registerReadingTools } = await import("../reading/connector.js");

function getToolExecute(name: string): (...args: unknown[]) => Promise<unknown> {
  const tool = registeredTools.get(name) as { execute: (...args: unknown[]) => Promise<unknown> };
  return tool.execute;
}

describe("reading-connector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredTools.clear();
    registerReadingTools();
  });

  it("registers all reading tools", () => {
    expect(registeredTools.has("addArticle")).toBe(true);
    expect(registeredTools.has("getReadingList")).toBe(true);
    expect(registeredTools.has("updateReadingStatus")).toBe(true);
    expect(registeredTools.has("getReadingStats")).toBe(true);
    expect(registeredTools.has("recommendNext")).toBe(true);
  });

  describe("addArticle", () => {
    it("creates an article", async () => {
      const article = { id: "a1", title: "Test Article" };
      mockCreateArticle.mockResolvedValueOnce(article);

      const execute = getToolExecute("addArticle");
      const result = await execute({ title: "Test Article", url: "https://example.com" });

      expect(mockCreateArticle).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Test Article", url: "https://example.com" }),
      );
      expect(result).toEqual({ article });
    });
  });

  describe("getReadingList", () => {
    it("returns articles with count", async () => {
      const articles = [{ id: "a1", title: "Article 1" }, { id: "a2", title: "Article 2" }];
      mockListArticles.mockResolvedValueOnce(articles);

      const execute = getToolExecute("getReadingList");
      const result = await execute({ status: "unread", limit: 10 });

      expect(result).toEqual({ articles, count: 2 });
    });

    it("returns empty list", async () => {
      mockListArticles.mockResolvedValueOnce([]);

      const execute = getToolExecute("getReadingList");
      const result = await execute({});

      expect(result).toEqual({ articles: [], count: 0 });
    });
  });

  describe("updateReadingStatus", () => {
    it("updates article status", async () => {
      const article = { id: "a1", status: "finished" };
      mockUpdateArticle.mockResolvedValueOnce(article);

      const execute = getToolExecute("updateReadingStatus");
      const result = await execute({ articleId: "a1", status: "finished", rating: 5 });

      expect(mockUpdateArticle).toHaveBeenCalledWith("a1", {
        status: "finished",
        rating: 5,
      });
      expect(result).toEqual({ article });
    });
  });

  describe("getReadingStats", () => {
    it("returns stats for all articles", async () => {
      const articles = [
        { id: "a1", status: "finished", category: "AI", addedAt: "2024-01-01" },
        { id: "a2", status: "reading", category: "AI", addedAt: "2024-01-02" },
        { id: "a3", status: "unread", category: "Tech", addedAt: "2024-01-03" },
      ];
      mockListArticles.mockResolvedValueOnce(articles);

      const execute = getToolExecute("getReadingStats");
      const result = await execute({ period: "all" });

      expect(result).toEqual({
        total: 3,
        finished: 1,
        reading: 1,
        unread: 1,
        byCategory: { AI: 2, Tech: 1 },
      });
    });

    it("handles articles without category", async () => {
      const articles = [
        { id: "a1", status: "finished", category: null, addedAt: "2024-01-01" },
      ];
      mockListArticles.mockResolvedValueOnce(articles);

      const execute = getToolExecute("getReadingStats");
      const result = await execute({ period: "all" });

      expect(result).toEqual(
        expect.objectContaining({ byCategory: { "未分类": 1 } }),
      );
    });
  });

  describe("recommendNext", () => {
    it("recommends the first unread article", async () => {
      const unread = [{ id: "a1", title: "Next Article" }];
      mockListArticles.mockResolvedValueOnce(unread);

      const execute = getToolExecute("recommendNext");
      const result = await execute({});

      expect(result).toEqual({
        recommendation: { id: "a1", title: "Next Article" },
        reason: expect.stringContaining("Next Article"),
      });
    });

    it("returns null recommendation when no unread articles", async () => {
      mockListArticles.mockResolvedValueOnce([]);

      const execute = getToolExecute("recommendNext");
      const result = await execute({});

      expect(result).toEqual({
        recommendation: null,
        reason: expect.stringContaining("阅读清单为空"),
      });
    });
  });
});
