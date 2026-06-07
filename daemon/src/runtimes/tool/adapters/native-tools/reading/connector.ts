import { tool } from "ai";
import { z } from "zod";
import { getRepositories } from "../../../../../persistence/factory.js";
import { registerTool } from "../registry.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function registerReadingTools(): void {
  registerTool("addArticle", tool({
    description: "添加文章到阅读清单。可指定 URL、标题、分类。",
    parameters: z.object({
      url: z.string().url().optional().describe("文章 URL"),
      title: z.string().min(1).describe("文章标题"),
      category: z.string().optional().describe("分类"),
      description: z.string().optional().describe("文章描述"),
    }),
    execute: async (args: any) => {
      const article = await getRepositories().articles.create(args);
      return { article };
    },
  } as any));

  registerTool("getReadingList", tool({
    description: "获取阅读清单。可按状态、分类筛选。",
    parameters: z.object({
      status: z.enum(["unread", "reading", "finished"]).optional(),
      category: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20).describe("返回数量上限"),
    }),
    execute: async (args: any) => {
      const articles = await getRepositories().articles.list(args);
      return { articles, count: articles.length };
    },
  } as any));

  registerTool("updateReadingStatus", tool({
    description: "更新文章阅读状态。可设置评分和笔记。",
    parameters: z.object({
      articleId: z.string().min(1).describe("文章 ID"),
      status: z.enum(["unread", "reading", "finished"]),
      rating: z.number().int().min(1).max(5).optional().describe("评分 1-5"),
      notes: z.string().optional().describe("笔记"),
    }),
    execute: async (args: any) => {
      const { articleId, ...data } = args;
      const article = await getRepositories().articles.update(articleId, data);
      return { article };
    },
  } as any));

  registerTool("getReadingStats", tool({
    description: "获取阅读统计数据。",
    parameters: z.object({
      period: z.enum(["week", "month", "all"]).default("all"),
    }),
    execute: async (args: any) => {
      const { period } = args;
      const allArticles = await getRepositories().articles.list();

      let filteredArticles = allArticles;
      if (period !== "all") {
        const now = new Date();
        const cutoff = new Date();
        if (period === "week") {
          cutoff.setDate(now.getDate() - 7);
        } else if (period === "month") {
          cutoff.setMonth(now.getMonth() - 1);
        }
        const cutoffStr = cutoff.toISOString();
        filteredArticles = allArticles.filter((a) => a.addedAt >= cutoffStr);
      }

      const stats = {
        total: filteredArticles.length,
        finished: filteredArticles.filter((a) => a.status === "finished").length,
        reading: filteredArticles.filter((a) => a.status === "reading").length,
        unread: filteredArticles.filter((a) => a.status === "unread").length,
        byCategory: {} as Record<string, number>,
      };

      for (const article of filteredArticles) {
        const cat = article.category ?? "未分类";
        stats.byCategory[cat] = (stats.byCategory[cat] ?? 0) + 1;
      }

      return stats;
    },
  } as any));

  registerTool("recommendNext", tool({
    description: "推荐下一篇阅读。基于未读清单和阅读历史。",
    parameters: z.object({}),
    execute: async () => {
      const unread = await getRepositories().articles.list({ status: "unread" });

      if (unread.length === 0) {
        return { recommendation: null, reason: "阅读清单为空，没有可推荐的文章。" };
      }

      const recommendation = unread[0];
      return {
        recommendation,
        reason: `推荐阅读「${recommendation.title}」，它是你阅读清单中最早添加的未读文章。`,
      };
    },
  } as any));
}
