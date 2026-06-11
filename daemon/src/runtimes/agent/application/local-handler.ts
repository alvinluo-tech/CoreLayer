/**
 * Local mode handler for when AI is not configured.
 * Handles common user intents by calling tools directly without an LLM.
 */

import { isTaskComplete } from "../../../workspaces/task-status.js";
import { logError } from "../../../shared/errors.js";

/**
 * When AI is not configured, handle requests locally using tool calls directly.
 */
export async function handleLocally(userMessage: string): Promise<{
  reply: string;
  toolCalls: { name: string; args: unknown; result: unknown }[];
}> {
  const msg = userMessage.toLowerCase();
  const toolCallsLog: { name: string; args: unknown; result: unknown }[] = [];

  // Today's tasks
  if (msg.includes("今天") && (msg.includes("任务") || msg.includes("todo"))) {
    const { getTool } = await import("../../tool/public-api.js");
    const t = getTool("getTodayTasks");
    if (t?.execute) {
      try {
        const result = await (t.execute as (...args: unknown[]) => unknown)({});
        toolCallsLog.push({ name: "getTodayTasks", args: {}, result });
        const data = result as { tasks: { title: string; status: string; priority: number }[]; count: number };
        if (data.count === 0) return { reply: "今天没有待办任务。", toolCalls: toolCallsLog };
        const lines = data.tasks.map((t, i) => `${i + 1}. [${isTaskComplete(t.status) ? "✅" : "⬜"}] ${t.title} (优先级: ${t.priority})`);
        return { reply: `今日 ${data.count} 个任务：\n${lines.join("\n")}`, toolCalls: toolCallsLog };
      } catch (e) {
        logError("handleLocally/getTodayTasks", e);
      }
    }
  }

  // All tasks
  if (msg.includes("任务") || msg.includes("todo")) {
    const { getTool } = await import("../../tool/public-api.js");
    const t = getTool("queryTasks");
    if (t?.execute) {
      const result = await (t.execute as (...args: unknown[]) => unknown)({});
      toolCallsLog.push({ name: "queryTasks", args: {}, result });
      const data = result as { tasks: { title: string; status: string }[]; count: number };
      if (data.count === 0) return { reply: "暂无任务。可以通过对话创建新任务。", toolCalls: toolCallsLog };
      const lines = data.tasks.slice(0, 10).map((t, i) => `${i + 1}. [${t.status}] ${t.title}`);
      return { reply: `共 ${data.count} 个任务：\n${lines.join("\n")}`, toolCalls: toolCallsLog };
    }
  }

  // Reading list
  if (msg.includes("阅读") || msg.includes("reading") || msg.includes("文章")) {
    const { getTool } = await import("../../tool/public-api.js");
    const t = getTool("getReadingList");
    if (t?.execute) {
      const result = await (t.execute as (...args: unknown[]) => unknown)({});
      toolCallsLog.push({ name: "getReadingList", args: {}, result });
      const data = result as { articles: { title: string; status: string }[]; count: number };
      if (data.count === 0) return { reply: "阅读清单为空。", toolCalls: toolCallsLog };
      const lines = data.articles.slice(0, 10).map((a, i) => `${i + 1}. [${a.status}] ${a.title}`);
      return { reply: `阅读清单共 ${data.count} 篇：\n${lines.join("\n")}`, toolCalls: toolCallsLog };
    }
  }

  // Daily summary
  if (msg.includes("总结") || msg.includes("summary") || msg.includes("复盘")) {
    const { getTool } = await import("../../tool/public-api.js");
    const t = getTool("getDailySummary");
    if (t?.execute) {
      const result = await (t.execute as (...args: unknown[]) => unknown)({});
      toolCallsLog.push({ name: "getDailySummary", args: {}, result });
      const data = result as { tasksCompleted: number; tasksTotal: number; completionRate: number; articlesRead: number };
      return {
        reply: `📊 今日总结\n任务完成: ${data.tasksCompleted}/${data.tasksTotal} (${data.completionRate}%)\n阅读文章: ${data.articlesRead} 篇`,
        toolCalls: toolCallsLog,
      };
    }
  }

  // Weekly stats
  if (msg.includes("周") || msg.includes("week")) {
    const { getTool } = await import("../../tool/public-api.js");
    const t = getTool("getWeeklyStats");
    if (t?.execute) {
      const result = await (t.execute as (...args: unknown[]) => unknown)({});
      toolCallsLog.push({ name: "getWeeklyStats", args: {}, result });
      const data = result as { tasksCompleted: number; tasksTotal: number; completionRate: number; articlesFinished: number };
      return {
        reply: `📊 本周统计\n任务完成: ${data.tasksCompleted}/${data.tasksTotal} (${data.completionRate}%)\n阅读完成: ${data.articlesFinished} 篇`,
        toolCalls: toolCallsLog,
      };
    }
  }

  // Create task
  const createMatch = msg.match(/(?:创建|添加|新建|add|create)[\s]*任务[\s：:]*(.+)/);
  if (createMatch) {
    const { getTool } = await import("../../tool/public-api.js");
    const t = getTool("createTask");
    if (t?.execute) {
      const title = createMatch[1].trim();
      const result = await (t.execute as (...args: unknown[]) => unknown)({ title });
      toolCallsLog.push({ name: "createTask", args: { title }, result });
      return { reply: `✅ 已创建任务：${title}`, toolCalls: toolCallsLog };
    }
  }

  // Add article
  const addArticleMatch = msg.match(/(?:添加|加入|add)[\s]*(?:文章|阅读|article)[\s：:]*(.+)/);
  if (addArticleMatch) {
    const { getTool } = await import("../../tool/public-api.js");
    const t = getTool("addArticle");
    if (t?.execute) {
      const title = addArticleMatch[1].trim();
      const result = await (t.execute as (...args: unknown[]) => unknown)({ title });
      toolCallsLog.push({ name: "addArticle", args: { title }, result });
      return { reply: `✅ 已添加到阅读清单：${title}`, toolCalls: toolCallsLog };
    }
  }

  // Recommend next reading
  if (msg.includes("推荐") || msg.includes("recommend") || msg.includes("下一篇")) {
    const { getTool } = await import("../../tool/public-api.js");
    const t = getTool("recommendNext");
    if (t?.execute) {
      const result = await (t.execute as (...args: unknown[]) => unknown)({});
      toolCallsLog.push({ name: "recommendNext", args: {}, result });
      const data = result as { recommendation: { title: string } | null; reason: string };
      if (!data.recommendation) return { reply: data.reason, toolCalls: toolCallsLog };
      return { reply: `📖 ${data.reason}`, toolCalls: toolCallsLog };
    }
  }

  // Help
  if (msg.includes("帮助") || msg.includes("help") || msg.includes("能做什么")) {
    return {
      reply: `我是 Jarvis，你的个人指令中心。我可以：

📋 **任务管理**
- "今天有什么任务？"
- "创建任务：写周报"
- "查看所有任务"

📚 **阅读清单**
- "阅读清单有什么？"
- "添加文章：xxx"
- "推荐下一篇"

📊 **总结复盘**
- "今日总结"
- "本周统计"

💡 当前为本地模式，配置 AI API Key 后可启用 AI 对话。`,
      toolCalls: toolCallsLog,
    };
  }

  return {
    reply: `收到你的消息：「${userMessage}」\n\n💡 当前为本地模式（未配置 AI API）。你可以试试：\n- "今天有什么任务？"\n- "阅读清单"\n- "今日总结"\n- "帮助" 查看所有命令`,
    toolCalls: toolCallsLog,
  };
}
