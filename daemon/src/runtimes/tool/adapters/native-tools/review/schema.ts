import { z } from "zod";

export const getDailySummarySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const getWeeklyStatsSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const saveReviewSchema = z.object({
  type: z.enum(["daily", "weekly"]),
  summary: z.string(),
  patterns: z.array(z.string()),
  suggestions: z.array(z.string()),
});

export const getReviewHistorySchema = z.object({
  type: z.enum(["daily", "weekly"]),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

export type GetDailySummaryInput = z.infer<typeof getDailySummarySchema>;
export type GetWeeklyStatsInput = z.infer<typeof getWeeklyStatsSchema>;
export type SaveReviewInput = z.infer<typeof saveReviewSchema>;
export type GetReviewHistoryInput = z.infer<typeof getReviewHistorySchema>;
