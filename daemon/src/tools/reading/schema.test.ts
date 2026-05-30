import { describe, it, expect } from "vitest";
import {
  addArticleSchema,
  getReadingListSchema,
  updateReadingStatusSchema,
  getReadingStatsSchema,
} from "./schema.js";

describe("addArticleSchema", () => {
  it("should accept valid input with all fields", () => {
    const result = addArticleSchema.safeParse({
      url: "https://example.com/article",
      title: "Test Article",
      category: "AI",
      description: "An article about AI",
    });
    expect(result.success).toBe(true);
  });

  it("should accept valid input with only title", () => {
    const result = addArticleSchema.safeParse({
      title: "Test Article",
    });
    expect(result.success).toBe(true);
  });

  it("should fail when title is missing", () => {
    const result = addArticleSchema.safeParse({
      url: "https://example.com",
    });
    expect(result.success).toBe(false);
  });

  it("should fail when title is empty", () => {
    const result = addArticleSchema.safeParse({
      title: "",
    });
    expect(result.success).toBe(false);
  });

  it("should fail when url is invalid", () => {
    const result = addArticleSchema.safeParse({
      title: "Test Article",
      url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("should accept undefined optional fields", () => {
    const result = addArticleSchema.safeParse({
      title: "Test Article",
      url: undefined,
      category: undefined,
      description: undefined,
    });
    expect(result.success).toBe(true);
  });
});

describe("getReadingListSchema", () => {
  it("should default limit to 20", () => {
    const result = getReadingListSchema.parse({});
    expect(result.limit).toBe(20);
  });

  it("should accept explicit limit", () => {
    const result = getReadingListSchema.parse({ limit: 50 });
    expect(result.limit).toBe(50);
  });

  it("should fail when status is invalid enum", () => {
    const result = getReadingListSchema.safeParse({ status: "archived" });
    expect(result.success).toBe(false);
  });

  it("should fail when limit exceeds 100", () => {
    const result = getReadingListSchema.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
  });

  it("should fail when limit is less than 1", () => {
    const result = getReadingListSchema.safeParse({ limit: 0 });
    expect(result.success).toBe(false);
  });
});

describe("updateReadingStatusSchema", () => {
  it("should accept valid input", () => {
    const result = updateReadingStatusSchema.safeParse({
      articleId: "article-1",
      status: "reading",
      rating: 4,
      notes: "Good read",
    });
    expect(result.success).toBe(true);
  });

  it("should fail when articleId is missing", () => {
    const result = updateReadingStatusSchema.safeParse({
      status: "reading",
    });
    expect(result.success).toBe(false);
  });

  it("should fail when status is missing", () => {
    const result = updateReadingStatusSchema.safeParse({
      articleId: "article-1",
    });
    expect(result.success).toBe(false);
  });

  it("should fail when rating exceeds 5", () => {
    const result = updateReadingStatusSchema.safeParse({
      articleId: "article-1",
      status: "finished",
      rating: 6,
    });
    expect(result.success).toBe(false);
  });

  it("should fail when rating is less than 1", () => {
    const result = updateReadingStatusSchema.safeParse({
      articleId: "article-1",
      status: "finished",
      rating: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("getReadingStatsSchema", () => {
  it("should default period to all", () => {
    const result = getReadingStatsSchema.parse({});
    expect(result.period).toBe("all");
  });

  it("should accept explicit period", () => {
    const result = getReadingStatsSchema.parse({ period: "week" });
    expect(result.period).toBe("week");
  });

  it("should fail when period is invalid", () => {
    const result = getReadingStatsSchema.safeParse({ period: "year" });
    expect(result.success).toBe(false);
  });
});
