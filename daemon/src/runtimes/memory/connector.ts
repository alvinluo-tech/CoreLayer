import { tool } from "ai";
import { z } from "zod";
import { getRepositories } from "../../db/factory.js";
import { registerTool } from "../../tools/registry.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function registerMemoryTools(): void {
  registerTool("memory_store", tool({
    description: "保存记忆到长期存储。用于记录用户的偏好、事实、上下文信息。当用户明确要求记住某事，或你发现重要的用户信息时主动调用。",
    parameters: z.object({
      key: z.string().min(1).max(100).describe("记忆关键词（简短，如 'coding_style', 'user_name'）"),
      value: z.string().min(1).max(500).describe("记忆内容（一句话描述）"),
      type: z.enum(["fact", "preference", "context"]).default("context").describe("记忆类型: fact=事实, preference=偏好, context=上下文"),
    }),
    execute: async (args: any) => {
      const repo = getRepositories().memories;
      const existing = await repo.getByKey(args.key);
      if (existing) {
        const updated = await repo.upsert({ key: args.key, value: args.value, type: args.type });
        return { action: "updated", memory: updated };
      }
      const created = await repo.upsert({ key: args.key, value: args.value, type: args.type });
      return { action: "created", memory: created };
    },
  } as any));

  registerTool("memory_search", tool({
    description: "搜索已有记忆。当你需要回忆关于用户的 information 时使用。",
    parameters: z.object({
      query: z.string().min(1).describe("搜索关键词"),
      limit: z.number().int().min(1).max(20).default(10).describe("返回数量"),
    }),
    execute: async (args: any) => {
      const repo = getRepositories().memories;
      const results = await repo.searchScored(args.query, "default", args.limit);
      return { memories: results, count: results.length };
    },
  } as any));

  registerTool("memory_list", tool({
    description: "列出所有已保存的记忆。",
    parameters: z.object({
      type: z.enum(["fact", "preference", "context"]).optional().describe("按类型筛选"),
    }),
    execute: async (args: any) => {
      const repo = getRepositories().memories;
      const memories = args.type
        ? await repo.getByType(args.type)
        : await repo.getAll();
      return { memories, count: memories.length };
    },
  } as any));

  registerTool("memory_delete", tool({
    description: "删除一条记忆。",
    parameters: z.object({
      key: z.string().min(1).describe("要删除的记忆关键词"),
    }),
    execute: async (args: any) => {
      const repo = getRepositories().memories;
      const existing = await repo.getByKey(args.key);
      if (!existing) {
        return { success: false, error: `记忆 '${args.key}' 不存在` };
      }
      await repo.delete(existing.id);
      return { success: true, deleted: args.key };
    },
  } as any));
}
