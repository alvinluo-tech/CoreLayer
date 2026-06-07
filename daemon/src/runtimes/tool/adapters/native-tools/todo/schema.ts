import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().min(1, "任务标题不能为空"),
  priority: z.number().int().min(1).max(5).optional().default(3),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tags: z.array(z.string()).optional().default([]),
  description: z.string().optional(),
});

export const queryTasksSchema = z.object({
  status: z.enum(["pending", "in_progress", "done"]).optional(),
  priority: z.number().int().min(1).max(5).optional(),
  tags: z.array(z.string()).optional(),
  dueDateFrom: z.string().optional(),
  dueDateTo: z.string().optional(),
});

export const updateTaskSchema = z.object({
  taskId: z.string().min(1),
  title: z.string().min(1).optional(),
  priority: z.number().int().min(1).max(5).optional(),
  status: z.enum(["pending", "in_progress", "done"]).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tags: z.array(z.string()).optional(),
});

export const deleteTaskSchema = z.object({
  taskId: z.string().min(1),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type QueryTasksInput = z.infer<typeof queryTasksSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type DeleteTaskInput = z.infer<typeof deleteTaskSchema>;
