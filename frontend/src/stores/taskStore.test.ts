import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockInvoke = vi.fn();
vi.mock('@/lib/tauri', () => ({
  queryTasks: (...args: unknown[]) => mockInvoke('queryTasks', ...args),
  createTask: (...args: unknown[]) => mockInvoke('createTask', ...args),
  updateTask: (...args: unknown[]) => mockInvoke('updateTask', ...args),
  deleteTask: (...args: unknown[]) => mockInvoke('deleteTask', ...args),
}));

import { useTaskStore } from './taskStore';

beforeEach(() => {
  mockInvoke.mockReset();
  useTaskStore.setState({ tasks: [], isLoading: false, error: null });
});

describe('useTaskStore', () => {
  const mockTask = {
    id: 'task-1',
    userId: 'user-1',
    title: 'Test task',
    description: null,
    priority: 3,
    status: 'pending' as const,
    dueDate: null,
    tags: [],
    completedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  describe('fetchTasks', () => {
    it('populates tasks on success', async () => {
      mockInvoke.mockResolvedValueOnce({ tasks: [mockTask], count: 1 });

      await useTaskStore.getState().fetchTasks();

      const state = useTaskStore.getState();
      expect(state.tasks).toEqual([mockTask]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('sets error on failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('network error'));

      await useTaskStore.getState().fetchTasks();

      const state = useTaskStore.getState();
      expect(state.tasks).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Error: network error');
    });

    it('sets isLoading while fetching', async () => {
      let resolveFn: (value: unknown) => void;
      mockInvoke.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFn = resolve;
        })
      );

      const promise = useTaskStore.getState().fetchTasks();
      expect(useTaskStore.getState().isLoading).toBe(true);

      resolveFn!({ tasks: [], count: 0 });
      await promise;
      expect(useTaskStore.getState().isLoading).toBe(false);
    });
  });

  describe('createTask', () => {
    it('adds task to list on success', async () => {
      mockInvoke.mockResolvedValueOnce({ task: mockTask });

      const result = await useTaskStore.getState().createTask({ title: 'Test task' });

      expect(result).toEqual(mockTask);
      expect(useTaskStore.getState().tasks).toEqual([mockTask]);
    });

    it('returns null and sets error on failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('create failed'));

      const result = await useTaskStore.getState().createTask({ title: 'Bad task' });

      expect(result).toBeNull();
      expect(useTaskStore.getState().error).toBe('Error: create failed');
    });
  });

  describe('updateTask', () => {
    it('updates task in list on success', async () => {
      useTaskStore.setState({ tasks: [mockTask] });
      const updated = { ...mockTask, title: 'Updated' };
      mockInvoke.mockResolvedValueOnce({ task: updated });

      const result = await useTaskStore
        .getState()
        .updateTask({ taskId: 'task-1', title: 'Updated' });

      expect(result).toEqual(updated);
      expect(useTaskStore.getState().tasks[0]!.title).toBe('Updated');
    });

    it('returns null and sets error on failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('update failed'));

      const result = await useTaskStore.getState().updateTask({ taskId: 'task-1', title: 'X' });

      expect(result).toBeNull();
      expect(useTaskStore.getState().error).toBe('Error: update failed');
    });
  });

  describe('deleteTask', () => {
    it('removes task from list on success', async () => {
      useTaskStore.setState({ tasks: [mockTask] });
      mockInvoke.mockResolvedValueOnce(undefined);

      const result = await useTaskStore.getState().deleteTask('task-1');

      expect(result).toBe(true);
      expect(useTaskStore.getState().tasks).toEqual([]);
    });

    it('returns false and sets error on failure', async () => {
      useTaskStore.setState({ tasks: [mockTask] });
      mockInvoke.mockRejectedValueOnce(new Error('delete failed'));

      const result = await useTaskStore.getState().deleteTask('task-1');

      expect(result).toBe(false);
      expect(useTaskStore.getState().tasks).toEqual([mockTask]);
      expect(useTaskStore.getState().error).toBe('Error: delete failed');
    });
  });
});
