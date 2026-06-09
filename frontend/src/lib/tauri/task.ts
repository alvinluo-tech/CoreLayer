import { invoke } from '@tauri-apps/api/core';
import type { Task } from '@/types/task';

export async function queryTasks(options?: {
  status?: string;
  priority?: number;
}): Promise<{ tasks: Task[]; count: number }> {
  return invoke('query_tasks', {
    status: options?.status ?? null,
    priority: options?.priority ?? null,
  });
}

export async function createTask(input: {
  title: string;
  priority?: number;
  dueDate?: string;
  tags?: string[];
  description?: string;
}): Promise<{ task: Task }> {
  return invoke('create_task', {
    title: input.title,
    priority: input.priority ?? null,
    dueDate: input.dueDate ?? null,
    tags: input.tags ?? null,
    description: input.description ?? null,
  });
}

export async function updateTask(input: {
  taskId: string;
  title?: string;
  priority?: number;
  status?: string;
  dueDate?: string;
  tags?: string[];
}): Promise<{ task: Task }> {
  return invoke('update_task', {
    taskId: input.taskId,
    title: input.title ?? null,
    priority: input.priority ?? null,
    status: input.status ?? null,
    dueDate: input.dueDate ?? null,
    tags: input.tags ?? null,
  });
}

export async function deleteTask(taskId: string): Promise<void> {
  await invoke('delete_task', { taskId });
}

export async function setTaskDependencies(
  taskId: string,
  dependencies: string[]
): Promise<{ task: Task }> {
  return invoke('set_task_dependencies', { taskId, dependencies });
}

export async function canExecuteTask(taskId: string): Promise<{ canExecute: boolean }> {
  return invoke('can_execute_task', { taskId });
}

export async function completeTask(taskId: string): Promise<{ task: Task }> {
  return invoke('complete_task', { taskId });
}

export async function getExecutableTasks(
  projectId: string
): Promise<{ tasks: Task[]; count: number }> {
  return invoke('get_executable_tasks', { projectId });
}

export async function detectTaskCycles(
  projectId: string
): Promise<{ cycles: string[][]; hasCycles: boolean }> {
  return invoke('detect_task_cycles', { projectId });
}

export async function decomposeTask(input: {
  objective: string;
  projectId: string;
  agentId?: string;
}): Promise<{ parentTaskId: string; subtasks: { id: string; title: string }[] }> {
  return invoke('decompose_task_command', {
    objective: input.objective,
    projectId: input.projectId,
    agentId: input.agentId ?? null,
  });
}
