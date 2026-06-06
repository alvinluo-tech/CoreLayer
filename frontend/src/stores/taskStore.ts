import { create } from 'zustand';
import type { Task, TaskStatus, CreateTaskInput, UpdateTaskInput } from '@/types/task';
import * as tauri from '@/lib/tauri';

export type TaskFilterStatus = 'all' | TaskStatus;

interface TaskState {
  tasks: Task[];
  selectedTaskId: string | null;
  filterStatus: TaskFilterStatus;
  isLoading: boolean;
  error: string | null;
  fetchTasks: () => Promise<void>;
  createTask: (input: CreateTaskInput) => Promise<Task | null>;
  updateTask: (input: UpdateTaskInput) => Promise<Task | null>;
  deleteTask: (taskId: string) => Promise<boolean>;
  selectTask: (id: string | null) => void;
  setFilterStatus: (status: TaskFilterStatus) => void;
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  selectedTaskId: null,
  filterStatus: 'all',
  isLoading: false,
  error: null,

  fetchTasks: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await tauri.queryTasks();
      set({ tasks: result.tasks, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  createTask: async (input) => {
    try {
      const result = await tauri.createTask(input);
      const task = result.task;
      set((state) => ({ tasks: [...state.tasks, task] }));
      return task;
    } catch (error) {
      set({ error: String(error) });
      return null;
    }
  },

  updateTask: async (input) => {
    try {
      const result = await tauri.updateTask(input);
      const task = result.task;
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === input.taskId ? task : t)),
      }));
      return task;
    } catch (error) {
      set({ error: String(error) });
      return null;
    }
  },

  deleteTask: async (taskId) => {
    try {
      await tauri.deleteTask(taskId);
      set((state) => ({
        tasks: state.tasks.filter((t) => t.id !== taskId),
      }));
      return true;
    } catch (error) {
      set({ error: String(error) });
      return false;
    }
  },

  selectTask: (id) => set({ selectedTaskId: id }),
  setFilterStatus: (status) => set({ filterStatus: status }),
}));
