import { eq, ne } from "drizzle-orm";
import { db, schema } from "../client.js";
import type {
  ReviewRepository,
  ReviewRow,
  SaveReviewInput,
  DailySummaryResult,
  WeeklyStatsResult,
} from "../repository.js";
import { isTaskComplete } from "../../task/task-status.js";

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
}

function normalizeReview(row: typeof schema.reviews.$inferSelect): ReviewRow {
  return {
    ...row,
    type: row.type as "daily" | "weekly",
    patterns: row.patterns ? JSON.parse(row.patterns) : null,
    suggestions: row.suggestions ? JSON.parse(row.suggestions) : null,
    rawData: row.rawData ? JSON.parse(row.rawData) : null,
  };
}

export function createSqliteReviewRepo(): ReviewRepository {
  return {
    async save(input: SaveReviewInput): Promise<ReviewRow> {
      const id = crypto.randomUUID();
      const now = new Date();
      const periodStart = input.type === "daily"
        ? now.toISOString().split("T")[0]
        : getWeekStart(now).toISOString().split("T")[0];
      const periodEnd = now.toISOString().split("T")[0];

      db.insert(schema.reviews)
        .values({
          id,
          userId: "local-user",
          type: input.type,
          periodStart,
          periodEnd,
          summary: input.summary,
          patterns: JSON.stringify(input.patterns),
          suggestions: input.suggestions ? JSON.stringify(input.suggestions) : null,
          createdAt: now.toISOString(),
        })
        .run();

      const row = db.select().from(schema.reviews).where(eq(schema.reviews.id, id)).get()!;
      return normalizeReview(row);
    },

    async getHistory(type: "daily" | "weekly", limit = 10): Promise<ReviewRow[]> {
      const rows = db
        .select()
        .from(schema.reviews)
        .where(eq(schema.reviews.type, type))
        .limit(limit)
        .all();
      return rows.map(normalizeReview);
    },

    async getDailySummary(date?: string): Promise<DailySummaryResult> {
      const targetDate = date ?? new Date().toISOString().split("T")[0];

      const allTasks = db
        .select()
        .from(schema.tasks)
        .where(ne(schema.tasks.status, "deleted"))
        .all();

      const dayTasks = allTasks.filter(
        (t) => t.dueDate === targetDate || t.createdAt.startsWith(targetDate),
      );

      const completed = dayTasks.filter((t) => isTaskComplete(t.status)).length;
      const total = dayTasks.length;

      const articles = db
        .select()
        .from(schema.articles)
        .where(eq(schema.articles.status, "finished"))
        .all()
        .filter((a) => a.finishedAt?.startsWith(targetDate));

      return {
        tasksCompleted: completed,
        tasksTotal: total,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        articlesRead: articles.length,
        highlights: dayTasks
          .filter((t) => isTaskComplete(t.status))
          .map((t) => `✅ ${t.title}`),
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

      const allTasks = db
        .select()
        .from(schema.tasks)
        .where(ne(schema.tasks.status, "deleted"))
        .all();

      const weekTasks = allTasks.filter((t) => {
        const d = t.dueDate ?? t.createdAt.split("T")[0];
        return d >= ws && d <= we;
      });

      const completed = weekTasks.filter((t) => isTaskComplete(t.status)).length;
      const total = weekTasks.length;

      const dailyBreakdown: { date: string; completed: number; total: number }[] = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date(weekStartDate);
        date.setDate(date.getDate() + i);
        const ds = date.toISOString().split("T")[0];
        const dayTasks = weekTasks.filter((t) => (t.dueDate ?? t.createdAt.split("T")[0]) === ds);
        dailyBreakdown.push({
          date: ds,
          completed: dayTasks.filter((t) => isTaskComplete(t.status)).length,
          total: dayTasks.length,
        });
      }

      const tagCounts: Record<string, number> = {};
      for (const task of weekTasks) {
        if (task.tags) {
          const tags = JSON.parse(task.tags) as string[];
          for (const tag of tags) {
            tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
          }
        }
      }
      const topTags = Object.entries(tagCounts)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const articlesFinished = db
        .select()
        .from(schema.articles)
        .where(eq(schema.articles.status, "finished"))
        .all()
        .filter((a) => a.finishedAt && a.finishedAt >= ws && a.finishedAt <= we + "T23:59:59")
        .length;

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
