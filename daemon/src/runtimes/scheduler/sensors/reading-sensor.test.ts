import { describe, it, expect, vi, beforeEach } from "vitest";

const mockListArticles = vi.fn();

vi.mock("../../../persistence/factory.js", () => ({
  getRepositories: () => ({
    articles: {
      list: mockListArticles,
    },
  }),
}));

const { createReadingSensor } = await import("./reading-sensor.js");

describe("reading-sensor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has correct name and default interval", () => {
    const sensor = createReadingSensor();
    expect(sensor.name).toBe("reading");
    expect(sensor.interval).toBe(120_000);
  });

  it("uses custom interval", () => {
    const sensor = createReadingSensor({ intervalMs: 5000 });
    expect(sensor.interval).toBe(5000);
  });

  it("returns null on first check (initialization)", async () => {
    mockListArticles.mockResolvedValue([
      { id: "1", title: "Article 1", status: "unread", rating: null },
    ]);
    const sensor = createReadingSensor();

    const changes = await sensor.check();
    expect(changes).toBeNull();
  });

  it("returns null when no changes detected", async () => {
    const articles = [
      { id: "1", title: "Article 1", status: "unread", rating: null },
    ];
    mockListArticles.mockResolvedValue(articles);
    const sensor = createReadingSensor();

    await sensor.check(); // initialize
    const changes = await sensor.check(); // same data

    expect(changes).toBeNull();
  });

  it("detects new articles", async () => {
    const sensor = createReadingSensor();

    mockListArticles.mockResolvedValueOnce([
      { id: "1", title: "Article 1", status: "unread", rating: null },
    ]);
    await sensor.check(); // initialize

    mockListArticles.mockResolvedValueOnce([
      { id: "1", title: "Article 1", status: "unread", rating: null },
      { id: "2", title: "Article 2", status: "unread", rating: null },
    ]);
    const changes = await sensor.check();

    expect(changes).toEqual([
      { type: "reading_added", detail: "New article: Article 2" },
    ]);
  });

  it("detects status transition to finished", async () => {
    const sensor = createReadingSensor();

    mockListArticles.mockResolvedValueOnce([
      { id: "1", title: "Article 1", status: "reading", rating: null },
    ]);
    await sensor.check(); // initialize

    mockListArticles.mockResolvedValueOnce([
      { id: "1", title: "Article 1", status: "finished", rating: 5 },
    ]);
    const changes = await sensor.check();

    expect(changes).toEqual([
      { type: "reading_finished", detail: "Finished reading: Article 1" },
    ]);
  });

  it("detects status transition to reading", async () => {
    const sensor = createReadingSensor();

    mockListArticles.mockResolvedValueOnce([
      { id: "1", title: "Article 1", status: "unread", rating: null },
    ]);
    await sensor.check(); // initialize

    mockListArticles.mockResolvedValueOnce([
      { id: "1", title: "Article 1", status: "reading", rating: null },
    ]);
    const changes = await sensor.check();

    expect(changes).toEqual([
      { type: "reading_started", detail: "Started reading: Article 1" },
    ]);
  });

  it("detects generic status change", async () => {
    const sensor = createReadingSensor();

    mockListArticles.mockResolvedValueOnce([
      { id: "1", title: "Article 1", status: "reading", rating: null },
    ]);
    await sensor.check(); // initialize

    mockListArticles.mockResolvedValueOnce([
      { id: "1", title: "Article 1", status: "archived", rating: null },
    ]);
    const changes = await sensor.check();

    expect(changes).toEqual([
      { type: "reading_status_changed", detail: 'Article "Article 1" status: reading → archived' },
    ]);
  });

  it("detects multiple changes at once", async () => {
    const sensor = createReadingSensor();

    mockListArticles.mockResolvedValueOnce([
      { id: "1", title: "Article 1", status: "unread", rating: null },
    ]);
    await sensor.check(); // initialize

    mockListArticles.mockResolvedValueOnce([
      { id: "1", title: "Article 1", status: "finished", rating: 4 },
      { id: "2", title: "Article 2", status: "unread", rating: null },
    ]);
    const changes = await sensor.check();

    expect(changes).toHaveLength(2);
    expect(changes).toContainEqual(
      expect.objectContaining({ type: "reading_finished" }),
    );
    expect(changes).toContainEqual(
      expect.objectContaining({ type: "reading_added" }),
    );
  });

  it("returns null when repository throws", async () => {
    mockListArticles.mockRejectedValue(new Error("DB error"));
    const sensor = createReadingSensor();

    const changes = await sensor.check();
    expect(changes).toBeNull();
  });

  it("handles articles with null rating in snapshot", async () => {
    const sensor = createReadingSensor();

    mockListArticles.mockResolvedValueOnce([
      { id: "1", title: "Article 1", status: "unread", rating: null },
    ]);
    await sensor.check();

    mockListArticles.mockResolvedValueOnce([
      { id: "1", title: "Article 1", status: "unread", rating: 3 },
    ]);
    const changes = await sensor.check();

    // Rating change alone doesn't trigger a status change
    expect(changes).toBeNull();
  });
});
