import { describe, it, expect } from "vitest";
import {
  getDailySummarySchema,
  getWeeklyStatsSchema,
  saveReviewSchema,
  getReviewHistorySchema,
} from "./schema.js";

describe("getDailySummarySchema", () => {
  it("should accept input with no date", () => {
    const result = getDailySummarySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("should accept valid date", () => {
    const result = getDailySummarySchema.safeParse({ date: "2024-06-15" });
    expect(result.success).toBe(true);
  });

  it("should fail on invalid date format", () => {
    const result = getDailySummarySchema.safeParse({ date: "15-06-2024" });
    expect(result.success).toBe(false);
  });
});

describe("getWeeklyStatsSchema", () => {
  it("should accept input with no weekStart", () => {
    const result = getWeeklyStatsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("should accept valid weekStart", () => {
    const result = getWeeklyStatsSchema.safeParse({ weekStart: "2024-06-10" });
    expect(result.success).toBe(true);
  });

  it("should fail on invalid date format", () => {
    const result = getWeeklyStatsSchema.safeParse({ weekStart: "2024/06/10" });
    expect(result.success).toBe(false);
  });
});

describe("saveReviewSchema", () => {
  it("should accept valid daily review", () => {
    const result = saveReviewSchema.safeParse({
      type: "daily",
      summary: "Productive day",
      patterns: ["morning focus"],
      suggestions: ["take more breaks"],
    });
    expect(result.success).toBe(true);
  });

  it("should accept valid weekly review", () => {
    const result = saveReviewSchema.safeParse({
      type: "weekly",
      summary: "Good week overall",
      patterns: ["consistent output"],
      suggestions: ["improve testing"],
    });
    expect(result.success).toBe(true);
  });

  it("should fail when type is missing", () => {
    const result = saveReviewSchema.safeParse({
      summary: "Missing type",
      patterns: [],
      suggestions: [],
    });
    expect(result.success).toBe(false);
  });

  it("should fail when summary is missing", () => {
    const result = saveReviewSchema.safeParse({
      type: "daily",
      patterns: [],
      suggestions: [],
    });
    expect(result.success).toBe(false);
  });

  it("should fail when type is invalid", () => {
    const result = saveReviewSchema.safeParse({
      type: "monthly",
      summary: "Invalid type",
      patterns: [],
      suggestions: [],
    });
    expect(result.success).toBe(false);
  });

  it("should accept empty patterns and suggestions arrays", () => {
    const result = saveReviewSchema.safeParse({
      type: "daily",
      summary: "Nothing notable",
      patterns: [],
      suggestions: [],
    });
    expect(result.success).toBe(true);
  });
});

describe("getReviewHistorySchema", () => {
  it("should default limit to 10", () => {
    const result = getReviewHistorySchema.parse({ type: "daily" });
    expect(result.limit).toBe(10);
  });

  it("should accept explicit limit", () => {
    const result = getReviewHistorySchema.parse({ type: "weekly", limit: 25 });
    expect(result.limit).toBe(25);
  });

  it("should fail when limit exceeds 50", () => {
    const result = getReviewHistorySchema.safeParse({ type: "daily", limit: 51 });
    expect(result.success).toBe(false);
  });

  it("should fail when limit is less than 1", () => {
    const result = getReviewHistorySchema.safeParse({ type: "daily", limit: 0 });
    expect(result.success).toBe(false);
  });

  it("should fail when type is invalid", () => {
    const result = getReviewHistorySchema.safeParse({ type: "monthly" });
    expect(result.success).toBe(false);
  });
});
