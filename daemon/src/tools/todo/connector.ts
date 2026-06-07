import { tool } from "ai";
import { z } from "zod";
import { getRepositories } from "../../persistence/factory.js";
import { registerTool } from "../registry.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function registerTodoTools(): void {
  registerTool("createTask", tool({
    description: "创建新任务。可指定标题、优先级(1-5, 1最高)、截止日期、标签。",
    parameters: z.object({
      title: z.string().min(1).describe("任务标题"),
      priority: z.number().int().min(1).max(5).default(3).describe("优先级 1-5, 1最高"),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("截止日期 YYYY-MM-DD"),
      tags: z.array(z.string()).default([]).describe("标签列表"),
      description: z.string().optional().describe("任务描述"),
    }),
    execute: async (args: any) => {
      const task = await getRepositories().tasks.create(args);
      return { task };
    },
  } as any));

  registerTool("getTodayTasks", tool({
    description: "获取今日待办任务（今日到期 + 高优先级未完成任务）。",
    parameters: z.object({}),
    execute: async () => {
      const tasks = await getRepositories().tasks.getTodayTasks();
      return { tasks, count: tasks.length };
    },
  } as any));

  registerTool("queryTasks", tool({
    description: "按条件查询任务。可按状态、优先级、标签、日期范围筛选。",
    parameters: z.object({
      status: z.enum(["pending", "in_progress", "done"]).optional(),
      priority: z.number().int().min(1).max(5).optional(),
      tags: z.array(z.string()).optional(),
      dueDateFrom: z.string().optional(),
      dueDateTo: z.string().optional(),
    }),
    execute: async (args: any) => {
      const tasks = await getRepositories().tasks.query(args);
      return { tasks, count: tasks.length };
    },
  } as any));

  registerTool("updateTask", tool({
    description: "更新任务属性。可修改标题、优先级、状态、截止日期、标签。",
    parameters: z.object({
      taskId: z.string().min(1).describe("任务 ID"),
      title: z.string().min(1).optional(),
      priority: z.number().int().min(1).max(5).optional(),
      status: z.enum(["pending", "in_progress", "done"]).optional(),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      tags: z.array(z.string()).optional(),
    }),
    execute: async (args: any) => {
      const { taskId, ...data } = args;
      const task = await getRepositories().tasks.update(taskId, data);
      return { task };
    },
  } as any));

  registerTool("deleteTask", tool({
    description: "软删除任务（标记为 deleted 状态）。",
    parameters: z.object({
      taskId: z.string().min(1).describe("任务 ID"),
    }),
    execute: async (args: any) => {
      await getRepositories().tasks.delete(args.taskId);
      return { success: true };
    },
  } as any));
}
