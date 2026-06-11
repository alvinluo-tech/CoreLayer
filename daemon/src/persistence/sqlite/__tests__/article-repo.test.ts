import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../schema.js";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      url TEXT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'unread',
      rating INTEGER,
      notes TEXT,
      category TEXT,
      added_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      started_at TEXT,
      finished_at TEXT
    );
  `);
  return drizzle(sqlite, { schema });
}

const testDb = createTestDb();

vi.mock("../../client.js", () => ({ db: testDb, schema }));

const { createSqliteArticleRepo } = await import("../article-repo.js");

describe("Article Repository", () => {
  let articles: ReturnType<typeof createSqliteArticleRepo>;

  beforeEach(() => {
    testDb.delete(schema.articles).run();
    articles = createSqliteArticleRepo();
  });

  describe("create", () => {
    it("should create an article with all fields", async () => {
      const article = await articles.create({
        title: "Rust Async Guide",
        url: "https://example.com/rust-async",
        description: "A comprehensive guide",
        category: "programming",
      });
      expect(article.id).toBeDefined();
      expect(article.title).toBe("Rust Async Guide");
      expect(article.url).toBe("https://example.com/rust-async");
      expect(article.description).toBe("A comprehensive guide");
      expect(article.category).toBe("programming");
      expect(article.status).toBe("unread");
      expect(article.userId).toBe("local-user");
      expect(article.addedAt).toBeDefined();
    });

    it("should create an article with minimal fields", async () => {
      const article = await articles.create({ title: "Quick Read" });
      expect(article.id).toBeDefined();
      expect(article.title).toBe("Quick Read");
      expect(article.url).toBeNull();
      expect(article.description).toBeNull();
      expect(article.category).toBeNull();
      expect(article.status).toBe("unread");
      expect(article.rating).toBeNull();
      expect(article.notes).toBeNull();
      expect(article.startedAt).toBeNull();
      expect(article.finishedAt).toBeNull();
    });
  });

  describe("list", () => {
    it("should return all articles when no filters", async () => {
      await articles.create({ title: "Article 1" });
      await articles.create({ title: "Article 2" });
      const list = await articles.list();
      expect(list.length).toBe(2);
    });

    it("should filter by status", async () => {
      await articles.create({ title: "Unread" });
      const a2 = await articles.create({ title: "Reading" });
      await articles.update(a2.id, { status: "reading" });

      const unread = await articles.list({ status: "unread" });
      expect(unread.length).toBe(1);
      expect(unread[0]!.title).toBe("Unread");
    });

    it("should filter by category", async () => {
      await articles.create({ title: "Tech", category: "tech" });
      await articles.create({ title: "Science", category: "science" });

      const tech = await articles.list({ category: "tech" });
      expect(tech.length).toBe(1);
      expect(tech[0]!.title).toBe("Tech");
    });

    it("should respect limit", async () => {
      for (let i = 0; i < 5; i++) {
        await articles.create({ title: `Article ${i}` });
      }
      const limited = await articles.list({ limit: 3 });
      expect(limited.length).toBe(3);
    });
  });

  describe("update", () => {
    it("should set startedAt when status changes to reading", async () => {
      const article = await articles.create({ title: "Read me" });
      const updated = await articles.update(article.id, { status: "reading" });
      expect(updated.status).toBe("reading");
      expect(updated.startedAt).toBeDefined();
    });

    it("should set finishedAt when status changes to finished", async () => {
      const article = await articles.create({ title: "Finish me" });
      const updated = await articles.update(article.id, { status: "finished" });
      expect(updated.status).toBe("finished");
      expect(updated.finishedAt).toBeDefined();
    });

    it("should update rating and notes", async () => {
      const article = await articles.create({ title: "Rate me" });
      const updated = await articles.update(article.id, {
        rating: 5,
        notes: "Excellent article",
      });
      expect(updated.rating).toBe(5);
      expect(updated.notes).toBe("Excellent article");
    });

    it("should accept custom startedAt/finishedAt", async () => {
      const article = await articles.create({ title: "Custom dates" });
      const customDate = "2026-01-15T10:00:00Z";
      const updated = await articles.update(article.id, {
        status: "reading",
        startedAt: customDate,
      });
      expect(updated.startedAt).toBe(customDate);
    });
  });

  describe("delete", () => {
    it("should hard delete an article", async () => {
      const article = await articles.create({ title: "Delete me" });
      const result = await articles.delete(article.id);
      expect(result).toBe(true);

      const found = await articles.getById(article.id);
      expect(found).toBeNull();
    });

    it("should return false for non-existent id", async () => {
      const result = await articles.delete("non-existent");
      expect(result).toBe(false);
    });
  });

  describe("getById", () => {
    it("should return an existing article", async () => {
      const created = await articles.create({ title: "Find me" });
      const found = await articles.getById(created.id);
      expect(found).not.toBeNull();
      expect(found!.title).toBe("Find me");
    });

    it("should return null for non-existent id", async () => {
      const found = await articles.getById("non-existent");
      expect(found).toBeNull();
    });
  });
});
