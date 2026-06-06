import { create } from 'zustand';
import type { Task, TaskStatus, CreateTaskInput, UpdateTaskInput } from '@/types/task';
import * as tauri from '@/lib/tauri';

export type TaskFilterStatus = 'all' | TaskStatus;

/**
 * Normalize a task from Tauri IPC — JSON array fields may arrive as
 * strings or null after passing through Rust serde.  Ensure every
 * array field is a real JS array so component code can safely call
 * .map / .length without runtime crashes.
 */
function normalizeTask(raw: Task): Task {
  const ensureArray = <T>(v: unknown): T[] => {
    if (Array.isArray(v)) return v as T[];
    if (typeof v === 'string') {
      try {
        return JSON.parse(v) as T[];
      } catch {
        return [];
      }
    }
    return [];
  };

  return {
    ...raw,
    tags: ensureArray<string>(raw.tags),
    dependencies: ensureArray<string>(raw.dependencies),
    blockedBy: ensureArray<string>(raw.blockedBy),
    acceptanceCriteria: ensureArray<string>(raw.acceptanceCriteria),
    artifacts: ensureArray<unknown>(raw.artifacts),
    runHistory: ensureArray<unknown>(raw.runHistory),
  };
}

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
      set({ tasks: result.tasks.map(normalizeTask), isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  createTask: async (input) => {
    try {
      const result = await tauri.createTask(input);
      const task = normalizeTask(result.task);
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
      const task = normalizeTask(result.task);
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
