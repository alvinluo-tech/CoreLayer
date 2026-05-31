import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockInvoke = vi.fn();
vi.mock('@/lib/tauri', () => ({
  getDailySummary: (...args: unknown[]) => mockInvoke('getDailySummary', ...args),
}));

import { useReviewStore } from './reviewStore';

beforeEach(() => {
  mockInvoke.mockReset();
  useReviewStore.setState({ dailySummary: null, isLoading: false, error: null });
});

describe('useReviewStore', () => {
  const mockSummary = {
    tasksCompleted: 5,
    tasksTotal: 8,
    completionRate: 0.625,
    articlesRead: 2,
    highlights: ['Finished article A', 'Completed task B'],
  };

  describe('fetchDailySummary', () => {
    it('fetches summary without date parameter', async () => {
      mockInvoke.mockResolvedValueOnce(mockSummary);

      await useReviewStore.getState().fetchDailySummary();

      expect(mockInvoke).toHaveBeenCalledWith('getDailySummary', undefined);
      const state = useReviewStore.getState();
      expect(state.dailySummary).toEqual(mockSummary);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('fetches summary with date parameter', async () => {
      mockInvoke.mockResolvedValueOnce(mockSummary);

      await useReviewStore.getState().fetchDailySummary('2026-05-30');

      expect(mockInvoke).toHaveBeenCalledWith('getDailySummary', '2026-05-30');
      const state = useReviewStore.getState();
      expect(state.dailySummary).toEqual(mockSummary);
      expect(state.isLoading).toBe(false);
    });

    it('sets error on failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('summary fetch failed'));

      await useReviewStore.getState().fetchDailySummary();

      const state = useReviewStore.getState();
      expect(state.dailySummary).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Error: summary fetch failed');
    });
  });
});
