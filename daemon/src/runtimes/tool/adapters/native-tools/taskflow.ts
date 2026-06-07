import { tool } from "ai";
import { z } from "zod";
import { getRepositories } from "../../../../persistence/factory.js";
import { registerTool } from "./registry.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * TaskFlow native tools — exposes Jarvis's internal task management.
 *
 * These tools call getRepositories() directly (no HTTP), so they are
 * registered as native tools rather than REST adapters.
 */
export function registerTaskFlowAdapter(): number {
  registerTool("taskflow_list_tasks", tool({
    description: "List tasks with optional status and priority filters",
    parameters: z.object({
      status: z.enum(["pending", "in_progress", "done"]).optional().describe("Filter by status"),
      priority: z.number().int().min(1).max(5).optional().describe("Filter by priority (1-5)"),
    }),
    execute: async (args: any) => {
      const tasks = await getRepositories().tasks.query({
        status: args.status,
        priority: args.priority,
      });
      return { tasks, count: tasks.length };
    },
  } as any));

  registerTool("taskflow_create_task", tool({
    description: "Create a new task with title, priority, due date, and tags",
    parameters: z.object({
      title: z.string().min(1).describe("Task title"),
      priority: z.number().int().min(1).max(5).default(3).describe("Priority 1-5 (default 3)"),
      dueDate: z.string().optional().describe("Due date (ISO string)"),
      tags: z.array(z.string()).default([]).describe("Task tags"),
      description: z.string().optional().describe("Task description"),
    }),
    execute: async (args: any) => {
      const task = await getRepositories().tasks.create({
        title: args.title,
        priority: args.priority ?? 3,
        dueDate: args.dueDate ?? null,
        tags: args.tags ?? [],
        description: args.description ?? null,
      });
      return { task };
    },
  } as any));

  console.log("[TaskFlow] Registered TaskFlow native tools (2)");
  return 2;
}
