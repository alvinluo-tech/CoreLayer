import { getRepositories } from "../../../persistence/factory.js";
import { logError } from "../../../shared/errors.js";
import { isTaskComplete } from "../../../workspaces/task-status.js";

/**
 * Report generation — produces daily and weekly markdown reports
 * from task completion stats, article progress, and conversation highlights.
 */

export interface ReportData {
  tasksCompleted: number;
  tasksTotal: number;
  completionRate: number;
  articlesRead: number;
  articlesTotal: number;
  conversationsCount: number;
  topMessages: string[];
}

/**
 * Gather report data for a given date range.
 */
async function gatherReportData(startDate: string, endDate: string): Promise<ReportData> {
  const repos = getRepositories();

  // Tasks
  const allTasks = await repos.tasks.query();
  const rangeTasks = allTasks.filter((t) => {
    if (t.status === "deleted") return false;
    const date = (t.dueDate ?? t.createdAt).split("T")[0];
    return date >= startDate && date <= endDate;
  });
  const completed = rangeTasks.filter((t) => isTaskComplete(t.status)).length;
  const total = rangeTasks.length;

  // Articles
  const articles = await repos.articles.list();
  const rangeArticles = articles.filter((a) => {
    if (!a.addedAt) return false;
    const date = a.addedAt.split("T")[0];
    return date >= startDate && date <= endDate;
  });
  const articlesRead = rangeArticles.filter((a) => a.status === "finished").length;

  // Conversations — recent messages as highlights
  const conversations = await repos.conversations.list();
  const rangeConversations = conversations.filter((c) => {
    const date = c.createdAt.split("T")[0];
    return date >= startDate && date <= endDate;
  });

  // Get first user message from each conversation as a highlight
  const topMessages: string[] = [];
  for (const conv of rangeConversations.slice(0, 5)) {
    const messages = await repos.conversations.getMessages(conv.id);
    const firstUser = messages.find((m) => m.role === "user");
    if (firstUser) {
      topMessages.push(firstUser.content.slice(0, 80));
    }
  }

  return {
    tasksCompleted: completed,
    tasksTotal: total,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    articlesRead,
    articlesTotal: rangeArticles.length,
    conversationsCount: rangeConversations.length,
    topMessages,
  };
}

/**
 * Format report data as markdown.
 */
function formatReport(data: ReportData, title: string): string {
  const lines = [
    `# ${title}`,
    "",
    `## 任务完成`,
    `- 完成: ${data.tasksCompleted} / ${data.tasksTotal}`,
    `- 完成率: ${data.completionRate}%`,
    "",
    `## 文章阅读`,
    `- 已读: ${data.articlesRead} / ${data.articlesTotal}`,
    "",
    `## 对话`,
    `- 对话数: ${data.conversationsCount}`,
  ];

  if (data.topMessages.length > 0) {
    lines.push("");
    lines.push("## 对话亮点");
    for (const msg of data.topMessages) {
      lines.push(`- ${msg}`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate a daily report for today.
 */
export async function generateDailyReport(): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().split("T")[0];

  const data = await gatherReportData(dateStr, dateStr);
  return formatReport(data, `每日报告 - ${dateStr}`);
}

/**
 * Generate a weekly report for the current week (Monday-Sunday).
 */
export async function generateWeeklyReport(): Promise<string> {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const startStr = monday.toISOString().split("T")[0];
  const endStr = sunday.toISOString().split("T")[0];

  const data = await gatherReportData(startStr, endStr);
  return formatReport(data, `每周报告 - ${startStr} ~ ${endStr}`);
}

/**
 * Register default report schedules (daily 21:00, weekly Sunday 21:00).
 * Skips if schedules already exist.
 */
export async function registerDefaultReportSchedules(): Promise<void> {
  try {
    const repos = getRepositories();
    const existing = await repos.scheduledTasks.getAll();

    const hasDaily = existing.some((t) => t.name === "daily-report");
    const hasWeekly = existing.some((t) => t.name === "weekly-report");

    if (!hasDaily) {
      await repos.scheduledTasks.upsert({
        name: "daily-report",
        cronExpr: "0 21 * * *",
        prompt: "生成今日每日报告",
        enabled: true,
      });
    }

    if (!hasWeekly) {
      await repos.scheduledTasks.upsert({
        name: "weekly-report",
        cronExpr: "0 21 * * 0",
        prompt: "生成本周每周报告",
        enabled: true,
      });
    }
  } catch (err) {
    logError("Reports/registerDefaults", err);
  }
}
