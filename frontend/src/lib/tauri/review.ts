import { invoke } from '@tauri-apps/api/core';

export async function getDailySummary(date?: string): Promise<{
  tasksCompleted: number;
  tasksTotal: number;
  completionRate: number;
  articlesRead: number;
  highlights: string[];
}> {
  return invoke('get_daily_summary', { date: date ?? null });
}

export async function getWeeklyStats(weekStart?: string): Promise<{
  tasksCompleted: number;
  tasksTotal: number;
  completionRate: number;
  dailyBreakdown: { date: string; completed: number; total: number }[];
  articlesFinished: number;
  topTags: { tag: string; count: number }[];
}> {
  return invoke('get_weekly_stats', { weekStart: weekStart ?? null });
}
