import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockList, mockCreate, mockUpdate } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("../../persistence/factory.js", () => ({
  getRepositories: () => ({
    articles: {
      list: (...args: unknown[]) => mockList(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
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

import app from "./articles.js";

function makeRequest(path: string, method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`http://localhost${path}`, init);
}

describe("articles route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /", () => {
    it("returns articles with count", async () => {
      mockList.mockResolvedValue([{ id: "a1", title: "Article 1" }]);

      const res = await app.fetch(makeRequest("/"));
      const json = (await res.json()) as { articles: unknown[]; count: number };

      expect(res.status).toBe(200);
      expect(json.articles).toHaveLength(1);
      expect(json.count).toBe(1);
    });

    it("passes query filters", async () => {
      mockList.mockResolvedValue([]);

      await app.fetch(makeRequest("/?status=read&category=tech&limit=10"));

      expect(mockList).toHaveBeenCalledWith({
        status: "read",
        category: "tech",
        limit: 10,
      });
    });

    it("returns 500 on error", async () => {
      mockList.mockRejectedValue(new Error("db error"));

      const res = await app.fetch(makeRequest("/"));
      expect(res.status).toBe(500);
    });
  });

  describe("POST /", () => {
    it("creates article with valid title", async () => {
      mockCreate.mockResolvedValue({ id: "a-new", title: "New Article" });

      const res = await app.fetch(
        makeRequest("/", "POST", { title: "New Article", url: "https://example.com" }),
      );
      const json = (await res.json()) as { article: { id: string; title: string } };

      expect(res.status).toBe(201);
      expect(json.article.title).toBe("New Article");
      expect(mockCreate).toHaveBeenCalledWith({
        title: "New Article",
        url: "https://example.com",
        category: undefined,
        description: undefined,
      });
    });

    it("returns 400 when title is missing", async () => {
      const res = await app.fetch(makeRequest("/", "POST", {}));
      expect(res.status).toBe(400);
    });

    it("returns 400 when title is blank", async () => {
      const res = await app.fetch(makeRequest("/", "POST", { title: "   " }));
      expect(res.status).toBe(400);
    });

    it("returns 500 on create error", async () => {
      mockCreate.mockRejectedValue(new Error("create failed"));

      const res = await app.fetch(
        makeRequest("/", "POST", { title: "Test" }),
      );
      expect(res.status).toBe(500);
    });
  });

  describe("PATCH /:id", () => {
    it("updates article status", async () => {
      mockUpdate.mockResolvedValue({ id: "a1", status: "read" });

      const res = await app.fetch(
        makeRequest("/a1", "PATCH", { status: "read" }),
      );
      const json = (await res.json()) as { article: { status: string } };

      expect(res.status).toBe(200);
      expect(json.article.status).toBe("read");
    });

    it("returns 404 when article not found", async () => {
      mockUpdate.mockRejectedValue(new Error("Article not found"));

      const res = await app.fetch(
        makeRequest("/nonexistent", "PATCH", { status: "read" }),
      );
      expect(res.status).toBe(404);
    });

    it("returns 500 on other errors", async () => {
      mockUpdate.mockRejectedValue(new Error("unexpected"));

      const res = await app.fetch(
        makeRequest("/a1", "PATCH", { rating: 5 }),
      );
      expect(res.status).toBe(500);
    });
  });
});
