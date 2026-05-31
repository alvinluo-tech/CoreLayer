export type ReviewType = 'daily' | 'weekly';

export interface Review {
  id: string;
  userId: string;
  type: ReviewType;
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
  taskCompletionRate: number;
  articlesRead: number;
  summary: string;
  patterns: string[];
  suggestions: string[];
  rawData: Record<string, unknown>;
  createdAt: string; // ISO datetime
}

export interface DailySummaryData {
  tasksCompleted: number;
  tasksTotal: number;
  completionRate: number;
  articlesRead: number;
  highlights: string[];
}

export interface WeeklyStatsData {
  tasksCompleted: number;
  tasksTotal: number;
  completionRate: number;
  dailyBreakdown: { date: string; completed: number; total: number }[];
  articlesFinished: number;
  topTags: { tag: string; count: number }[];
}
