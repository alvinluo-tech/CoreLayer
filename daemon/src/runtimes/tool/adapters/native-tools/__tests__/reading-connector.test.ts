import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../../../../../persistence/schema.js";

function createTestDb() {
  const sqlite = new Database(":memory:");
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

describe("Reading Connector", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("should add an article", () => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.insert(schema.articles)
      .values({
        id,
        userId: "test-user",
        title: "Test Article",
        url: "https://example.com",
        category: "AI",
        status: "unread",
        addedAt: now,
      })
      .run();

    const article = db.select().from(schema.articles).where(eq(schema.articles.id, id)).get();
    expect(article).toBeDefined();
    expect(article?.title).toBe("Test Article");
    expect(article?.status).toBe("unread");
  });

  it("should update reading status", () => {
    const now = new Date().toISOString();
    const id = "1";

    db.insert(schema.articles)
      .values({
        id,
        userId: "u1",
        title: "Article 1",
        status: "unread",
        addedAt: now,
      })
      .run();

    db.update(schema.articles)
      .set({ status: "reading", startedAt: now })
      .where(eq(schema.articles.id, id))
      .run();

    const article = db.select().from(schema.articles).where(eq(schema.articles.id, id)).get();
    expect(article?.status).toBe("reading");
    expect(article?.startedAt).toBe(now);
  });

  it("should get reading stats", () => {
    const now = new Date().toISOString();

    db.insert(schema.articles)
      .values([
        { id: "1", userId: "u1", title: "A1", status: "unread", addedAt: now },
        { id: "2", userId: "u1", title: "A2", status: "reading", addedAt: now },
        { id: "3", userId: "u1", title: "A3", status: "finished", addedAt: now },
        { id: "4", userId: "u1", title: "A4", status: "finished", addedAt: now },
      ])
      .run();

    const all = db.select().from(schema.articles).all();
    const stats = {
      total: all.length,
      finished: all.filter((a) => a.status === "finished").length,
      reading: all.filter((a) => a.status === "reading").length,
      unread: all.filter((a) => a.status === "unread").length,
    };

    expect(stats.total).toBe(4);
    expect(stats.finished).toBe(2);
    expect(stats.reading).toBe(1);
    expect(stats.unread).toBe(1);
  });
});
