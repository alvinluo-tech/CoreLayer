import { getSupabaseClient } from "./client.js";
import { isTaskComplete } from "../../task/task-status.js";
import type {
  ReviewRepository,
  ReviewRow,
  SaveReviewInput,
  DailySummaryResult,
  WeeklyStatsResult,
} from "../repository.js";

const REVIEWS_TABLE = "reviews";
const TASKS_TABLE = "tasks";
const ARTICLES_TABLE = "articles";

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function toReviewRow(row: Record<string, unknown>): ReviewRow {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    type: row.type as "daily" | "weekly",
    periodStart: row.period_start as string,
    periodEnd: row.period_end as string,
    taskCompletionRate: (row.task_completion_rate as number) ?? null,
    articlesRead: (row.articles_read as number) ?? null,
    summary: (row.summary as string) ?? null,
    patterns: (row.patterns as string[]) ?? null,
    suggestions: (row.suggestions as string[]) ?? null,
    rawData: row.raw_data ?? null,
    createdAt: (row.created_at as string) ?? "",
  };
}

export function createSupabaseReviewRepo(): ReviewRepository {
  const client = getSupabaseClient();

  return {
    async save(input: SaveReviewInput): Promise<ReviewRow> {
      const now = new Date();
      const periodStart = input.type === "daily"
        ? now.toISOString().split("T")[0]
        : getWeekStart(now).toISOString().split("T")[0];
      const periodEnd = now.toISOString().split("T")[0];

      const { data, error } = await client
        .from(REVIEWS_TABLE)
        .insert({
          user_id: "local-user",
          type: input.type,
          period_start: periodStart,
          period_end: periodEnd,
          summary: input.summary,
          patterns: input.patterns,
          suggestions: input.suggestions ?? null,
          created_at: now.toISOString(),
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to save review: ${error.message}`);
      return toReviewRow(data);
    },

    async getHistory(type: "daily" | "weekly", limit = 10): Promise<ReviewRow[]> {
      const { data, error } = await client
        .from(REVIEWS_TABLE)
        .select("*")
        .eq("type", type)
        .limit(limit)
        .order("created_at", { ascending: false });

      if (error) throw new Error(`Failed to get review history: ${error.message}`);
      return (data ?? []).map(toReviewRow);
    },

    async getDailySummary(date?: string): Promise<DailySummaryResult> {
      const targetDate = date ?? new Date().toISOString().split("T")[0];

      // Get tasks
      const { data: tasks } = await client
        .from(TASKS_TABLE)
        .select("*")
        .neq("status", "deleted");

      const dayTasks = (tasks ?? []).filter(
        (t: Record<string, unknown>) =>
          t.due_date === targetDate || (t.created_at as string)?.startsWith(targetDate),
      );

      const completed = dayTasks.filter((t: Record<string, unknown>) => isTaskComplete(t.status as string)).length;
      const total = dayTasks.length;

      // Get articles
      const { data: articles } = await client
        .from(ARTICLES_TABLE)
        .select("*")
        .eq("status", "finished");

      const articlesRead = (articles ?? []).filter(
        (a: Record<string, unknown>) => (a.finished_at as string)?.startsWith(targetDate),
      ).length;

      return {
        tasksCompleted: completed,
        tasksTotal: total,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        articlesRead,
        highlights: dayTasks
          .filter((t: Record<string, unknown>) => isTaskComplete(t.status as string))
          .map((t: Record<string, unknown>) => `✅ ${t.title}`),
      };
    },

    async getWeeklyStats(weekStart?: string): Promise<WeeklyStatsResult> {
      const weekStartDate = weekStart
        ? new Date(weekStart)
        : getWeekStart(new Date());
      const weekEndDate = new Date(weekStartDate);
      weekEndDate.setDate(weekEndDate.getDate() + 6);

      const ws = weekStartDate.toISOString().split("T")[0];
      const we = weekEndDate.toISOString().split("T")[0];

      const { data: tasks } = await client
        .from(TASKS_TABLE)
        .select("*")
        .neq("status", "deleted");

      const weekTasks = (tasks ?? []).filter((t: Record<string, unknown>) => {
        const d = (t.due_date as string) ?? (t.created_at as string)?.split("T")[0];
        return d >= ws && d <= we;
      });

      const completed = weekTasks.filter((t: Record<string, unknown>) => isTaskComplete(t.status as string)).length;
      const total = weekTasks.length;

      const dailyBreakdown: { date: string; completed: number; total: number }[] = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date(weekStartDate);
        date.setDate(date.getDate() + i);
        const ds = date.toISOString().split("T")[0];
        const dayTasks = weekTasks.filter(
          (t: Record<string, unknown>) => ((t.due_date as string) ?? (t.created_at as string)?.split("T")[0]) === ds,
        );
        dailyBreakdown.push({
          date: ds,
          completed: dayTasks.filter((t: Record<string, unknown>) => isTaskComplete(t.status as string)).length,
          total: dayTasks.length,
        });
      }

      const tagCounts: Record<string, number> = {};
      for (const task of weekTasks) {
        const tags = task.tags as string[] | null;
        if (tags) {
          for (const tag of tags) {
            tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
          }
        }
      }
      const topTags = Object.entries(tagCounts)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const { data: articles } = await client
        .from(ARTICLES_TABLE)
        .select("*")
        .eq("status", "finished");

      const articlesFinished = (articles ?? []).filter(
        (a: Record<string, unknown>) =>
          a.finished_at && (a.finished_at as string) >= ws && (a.finished_at as string) <= we + "T23:59:59",
      ).length;

      return {
        tasksCompleted: completed,
        tasksTotal: total,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        dailyBreakdown,
        articlesFinished,
        topTags,
      };
    },
  };
}
