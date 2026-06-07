import { tool } from "ai";
import { z } from "zod";
import { getRepositories } from "../../../../../persistence/factory.js";
import { registerTool } from "../registry.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function registerReviewTools(): void {
  registerTool("getDailySummary", tool({
    description: "获取指定日期的任务完成情况汇总。默认今日。",
    parameters: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("日期 YYYY-MM-DD，默认今日"),
    }),
    execute: async (args: any) => {
      const result = await getRepositories().reviews.getDailySummary(args.date);
      return result;
    },
  } as any));

  registerTool("getWeeklyStats", tool({
    description: "获取本周统计数据。包含每日分解、阅读量、高频标签。",
    parameters: z.object({
      weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("周一日期 YYYY-MM-DD"),
    }),
    execute: async (args: any) => {
      const result = await getRepositories().reviews.getWeeklyStats(args.weekStart);
      return result;
    },
  } as any));

  registerTool("saveReview", tool({
    description: "保存 AI 生成的回顾记录。",
    parameters: z.object({
      type: z.enum(["daily", "weekly"]),
      summary: z.string().describe("AI 生成的总结"),
      patterns: z.array(z.string()).describe("识别的模式"),
      suggestions: z.array(z.string()).describe("改进建议"),
    }),
    execute: async (args: any) => {
      const review = await getRepositories().reviews.save(args);
      return { review };
    },
  } as any));

  registerTool("getReviewHistory", tool({
    description: "获取历史回顾记录。",
    parameters: z.object({
      type: z.enum(["daily", "weekly"]),
      limit: z.number().int().min(1).max(50).default(10).describe("返回数量"),
    }),
    execute: async (args: any) => {
      const reviews = await getRepositories().reviews.getHistory(args.type, args.limit);
      return { reviews };
    },
  } as any));
}
