import { z } from "zod";

export const addArticleSchema = z.object({
  url: z.string().url().optional(),
  title: z.string().min(1, "文章标题不能为空"),
  category: z.string().optional(),
  description: z.string().optional(),
});

export const getReadingListSchema = z.object({
  status: z.enum(["unread", "reading", "finished"]).optional(),
  category: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export const updateReadingStatusSchema = z.object({
  articleId: z.string().min(1),
  status: z.enum(["unread", "reading", "finished"]),
  rating: z.number().int().min(1).max(5).optional(),
  notes: z.string().optional(),
});

export const getReadingStatsSchema = z.object({
  period: z.enum(["week", "month", "all"]).optional().default("all"),
});

export type AddArticleInput = z.infer<typeof addArticleSchema>;
export type GetReadingListInput = z.infer<typeof getReadingListSchema>;
export type UpdateReadingStatusInput = z.infer<typeof updateReadingStatusSchema>;
export type GetReadingStatsInput = z.infer<typeof getReadingStatsSchema>;
