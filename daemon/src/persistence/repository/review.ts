export interface ReviewRow {
  id: string;
  userId: string;
  type: "daily" | "weekly";
  periodStart: string;
  periodEnd: string;
  taskCompletionRate: number | null;
  articlesRead: number | null;
  summary: string | null;
  patterns: string[] | null;
  suggestions: string[] | null;
  rawData: unknown | null;
  createdAt: string;
}

export interface SaveReviewInput {
  type: "daily" | "weekly";
  summary: string;
  patterns: string[];
  suggestions?: string[];
}

export interface DailySummaryResult {
  tasksCompleted: number;
  tasksTotal: number;
  completionRate: number;
  articlesRead: number;
  highlights: string[];
}

export interface WeeklyStatsResult {
  tasksCompleted: number;
  tasksTotal: number;
  completionRate: number;
  dailyBreakdown: { date: string; completed: number; total: number }[];
  articlesFinished: number;
  topTags: { tag: string; count: number }[];
}

export interface ReviewRepository {
  save(input: SaveReviewInput): Promise<ReviewRow>;
  getHistory(type: "daily" | "weekly", limit?: number): Promise<ReviewRow[]>;
  getDailySummary(date?: string): Promise<DailySummaryResult>;
  getWeeklyStats(weekStart?: string): Promise<WeeklyStatsResult>;
}
