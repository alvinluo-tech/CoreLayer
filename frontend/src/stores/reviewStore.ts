import { create } from 'zustand';
import * as tauri from '@/lib/tauri';

export interface DailySummaryData {
  tasksCompleted: number;
  tasksTotal: number;
  completionRate: number;
  articlesRead: number;
  highlights: string[];
}

interface ReviewState {
  dailySummary: DailySummaryData | null;
  isLoading: boolean;
  error: string | null;
  fetchDailySummary: (date?: string) => Promise<void>;
}

export const useReviewStore = create<ReviewState>((set) => ({
  dailySummary: null,
  isLoading: false,
  error: null,

  fetchDailySummary: async (date?: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await tauri.getDailySummary(date);
      set({ dailySummary: result as DailySummaryData, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },
}));
