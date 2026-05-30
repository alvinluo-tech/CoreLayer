import { describe, it, expect, beforeEach, vi } from "vitest";

const mockInvoke = vi.fn();
vi.mock("@/lib/tauri", () => ({
  getReadingList: (...args: unknown[]) => mockInvoke("getReadingList", ...args),
  addArticle: (...args: unknown[]) => mockInvoke("addArticle", ...args),
  updateReadingStatus: (...args: unknown[]) => mockInvoke("updateReadingStatus", ...args),
}));

import { useArticleStore } from "./articleStore";

beforeEach(() => {
  mockInvoke.mockReset();
  useArticleStore.setState({ articles: [], isLoading: false, error: null });
});

describe("useArticleStore", () => {
  const mockArticle = {
    id: "art-1",
    userId: "user-1",
    url: "https://example.com",
    title: "Test article",
    description: null,
    status: "unread" as const,
    rating: null,
    notes: null,
    category: null,
    addedAt: "2026-01-01T00:00:00Z",
    startedAt: null,
    finishedAt: null,
  };

  describe("fetchArticles", () => {
    it("populates articles on success", async () => {
      mockInvoke.mockResolvedValueOnce({ articles: [mockArticle], count: 1 });

      await useArticleStore.getState().fetchArticles();

      const state = useArticleStore.getState();
      expect(state.articles).toEqual([mockArticle]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it("sets error on failure", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("fetch failed"));

      await useArticleStore.getState().fetchArticles();

      const state = useArticleStore.getState();
      expect(state.articles).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe("Error: fetch failed");
    });
  });

  describe("addArticle", () => {
    it("adds article to list on success", async () => {
      mockInvoke.mockResolvedValueOnce({ article: mockArticle });

      const result = await useArticleStore.getState().addArticle({ title: "Test article" });

      expect(result).toEqual(mockArticle);
      expect(useArticleStore.getState().articles).toEqual([mockArticle]);
    });

    it("returns null and sets error on failure", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("add failed"));

      const result = await useArticleStore.getState().addArticle({ title: "Bad" });

      expect(result).toBeNull();
      expect(useArticleStore.getState().error).toBe("Error: add failed");
    });
  });

  describe("updateStatus", () => {
    it("updates article in list on success", async () => {
      useArticleStore.setState({ articles: [mockArticle] });
      const updated = { ...mockArticle, status: "reading" };
      mockInvoke.mockResolvedValueOnce({ article: updated });

      const result = await useArticleStore.getState().updateStatus({
        articleId: "art-1",
        status: "reading",
      });

      expect(result).toEqual(updated);
      expect(useArticleStore.getState().articles[0]!.status).toBe("reading");
    });

    it("returns null and sets error on failure", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("update failed"));

      const result = await useArticleStore.getState().updateStatus({
        articleId: "art-1",
        status: "finished",
      });

      expect(result).toBeNull();
      expect(useArticleStore.getState().error).toBe("Error: update failed");
    });
  });
});
