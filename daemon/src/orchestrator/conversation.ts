import { generateText, streamText, stepCountIs } from "ai";
import type { ModelMessage } from "ai";
import { buildSystemPrompt } from "./prompt-builder.js";
import { getModel } from "../ai/provider.js";
import { getAllTools } from "../tools/registry.js";
import { wrapToolsForAI } from "../runtime/ai-tool-wrapper.js";
import { env } from "../config/env.js";
import { configManager } from "../config/config-manager.js";
import { getRepositories } from "../db/factory.js";
import type { MessageRow, ConversationRow } from "../db/repository.js";
import { classifyError, extractErrorMessage, logError } from "../utils/errors.js";

const MAX_HISTORY_MESSAGES = 20;

export function isAiConfigured(): boolean {
  // Check ~/.jarvis/credentials.json first
  const creds = configManager.getCredentials();
  if (Object.values(creds).some((v) => v)) return true;

  // Fallback: check env vars — provider and key must both be present
  if (!env.AI_PROVIDER) return false;
  return Boolean(
    env.MIMO_API_KEY || env.GROQ_API_KEY || env.OPENROUTER_API_KEY ||
    process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY
  );
}

export function generateTitleFromMessage(message: string): string {
  const cleaned = message.replace(/\n/g, " ").trim();
  return cleaned.length > 30 ? cleaned.slice(0, 30) + "..." : cleaned;
}

/**
 * When AI is not configured, handle requests locally using tool calls directly.
 */
async function handleLocally(userMessage: string): Promise<{
  reply: string;
  toolCalls: { name: string; args: unknown; result: unknown }[];
}> {
  const msg = userMessage.toLowerCase();
  const toolCallsLog: { name: string; args: unknown; result: unknown }[] = [];

  // Today's tasks
  if (msg.includes("今天") && (msg.includes("任务") || msg.includes("todo"))) {
    const { getTool } = await import("../tools/registry.js");
    const t = getTool("getTodayTasks");
    if (t?.execute) {
      try {
        const result = await (t.execute as Function)({});
        toolCallsLog.push({ name: "getTodayTasks", args: {}, result });
        const data = result as { tasks: { title: string; status: string; priority: number }[]; count: number };
        if (data.count === 0) return { reply: "今天没有待办任务。", toolCalls: toolCallsLog };
        const lines = data.tasks.map((t, i) => `${i + 1}. [${t.status === "done" ? "✅" : "⬜"}] ${t.title} (优先级: ${t.priority})`);
        return { reply: `今日 ${data.count} 个任务：\n${lines.join("\n")}`, toolCalls: toolCallsLog };
      } catch (e) {
        logError("handleLocally/getTodayTasks", e);
      }
    }
  }

  // All tasks
  if (msg.includes("任务") || msg.includes("todo")) {
    const { getTool } = await import("../tools/registry.js");
    const t = getTool("queryTasks");
    if (t?.execute) {
      const result = await (t.execute as Function)({});
      toolCallsLog.push({ name: "queryTasks", args: {}, result });
      const data = result as { tasks: { title: string; status: string }[]; count: number };
      if (data.count === 0) return { reply: "暂无任务。可以通过对话创建新任务。", toolCalls: toolCallsLog };
      const lines = data.tasks.slice(0, 10).map((t, i) => `${i + 1}. [${t.status}] ${t.title}`);
      return { reply: `共 ${data.count} 个任务：\n${lines.join("\n")}`, toolCalls: toolCallsLog };
    }
  }

  // Reading list
  if (msg.includes("阅读") || msg.includes("reading") || msg.includes("文章")) {
    const { getTool } = await import("../tools/registry.js");
    const t = getTool("getReadingList");
    if (t?.execute) {
      const result = await (t.execute as Function)({});
      toolCallsLog.push({ name: "getReadingList", args: {}, result });
      const data = result as { articles: { title: string; status: string }[]; count: number };
      if (data.count === 0) return { reply: "阅读清单为空。", toolCalls: toolCallsLog };
      const lines = data.articles.slice(0, 10).map((a, i) => `${i + 1}. [${a.status}] ${a.title}`);
      return { reply: `阅读清单共 ${data.count} 篇：\n${lines.join("\n")}`, toolCalls: toolCallsLog };
    }
  }

  // Daily summary
  if (msg.includes("总结") || msg.includes("summary") || msg.includes("复盘")) {
    const { getTool } = await import("../tools/registry.js");
    const t = getTool("getDailySummary");
    if (t?.execute) {
      const result = await (t.execute as Function)({});
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
    const { getTool } = await import("../tools/registry.js");
    const t = getTool("getWeeklyStats");
    if (t?.execute) {
      const result = await (t.execute as Function)({});
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
    const { getTool } = await import("../tools/registry.js");
    const t = getTool("createTask");
    if (t?.execute) {
      const title = createMatch[1].trim();
      const result = await (t.execute as Function)({ title });
      toolCallsLog.push({ name: "createTask", args: { title }, result });
      return { reply: `✅ 已创建任务：${title}`, toolCalls: toolCallsLog };
    }
  }

  // Add article
  const addArticleMatch = msg.match(/(?:添加|加入|add)[\s]*(?:文章|阅读|article)[\s：:]*(.+)/);
  if (addArticleMatch) {
    const { getTool } = await import("../tools/registry.js");
    const t = getTool("addArticle");
    if (t?.execute) {
      const title = addArticleMatch[1].trim();
      const result = await (t.execute as Function)({ title });
      toolCallsLog.push({ name: "addArticle", args: { title }, result });
      return { reply: `✅ 已添加到阅读清单：${title}`, toolCalls: toolCallsLog };
    }
  }

  // Recommend next reading
  if (msg.includes("推荐") || msg.includes("recommend") || msg.includes("下一篇")) {
    const { getTool } = await import("../tools/registry.js");
    const t = getTool("recommendNext");
    if (t?.execute) {
      const result = await (t.execute as Function)({});
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

/**
 * Handle a message within a conversation context (non-streaming).
 * Uses Vercel AI SDK generateText with automatic tool calling.
 */
export async function handleMessageInConversation(
  conversationId: string,
  userMessage: string,
): Promise<{
  userMessage: MessageRow;
  assistantMessage: MessageRow;
  conversation: ConversationRow;
}> {
  const repo = getRepositories().conversations;

  // Persist user message
  const savedUserMsg = await repo.addMessage(conversationId, {
    role: "user",
    content: userMessage,
  });

  // Auto-generate title from first message
  const conversation = await repo.getById(conversationId);
  if (conversation && conversation.title === "New Chat" && conversation.messageCount <= 1) {
    const title = generateTitleFromMessage(userMessage);
    await repo.update(conversationId, { title });
  }

  // Load message history
  const history = await repo.getMessages(conversationId);
  const recentHistory = history.slice(-MAX_HISTORY_MESSAGES);

  let reply: string;
  let toolCallsLog: { name: string; args: unknown; result: unknown }[] = [];

  if (isAiConfigured()) {
    const messages: ModelMessage[] = [
      { role: "system", content: buildSystemPrompt("text", conversationId) },
      ...recentHistory.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
    ];

    try {
      const result = await generateText({
        model: getModel(),
        messages,
        tools: wrapToolsForAI(getAllTools(), conversationId),
        stopWhen: stepCountIs(5),
      });

      reply = result.text;

      // Extract tool calls from steps
      for (const step of result.steps ?? []) {
        for (const toolCall of step.toolCalls ?? []) {
          const toolResult = step.toolResults?.find((r) => r.toolCallId === toolCall.toolCallId);
          toolCallsLog.push({
            name: toolCall.toolName,
            args: "input" in toolCall ? toolCall.input : {},
            result: toolResult && "output" in toolResult ? toolResult.output : null,
          });
        }
      }
    } catch (err) {
      logError("handleMessageInConversation/generateText", err);
      const { code } = classifyError(err);
      throw Object.assign(new Error(extractErrorMessage(err)), { code });
    }
  } else {
    const localResult = await handleLocally(userMessage);
    reply = localResult.reply;
    toolCallsLog = localResult.toolCalls;
  }

  // Persist assistant message
  const savedAssistantMsg = await repo.addMessage(conversationId, {
    role: "assistant",
    content: reply,
    toolCalls: toolCallsLog.length > 0 ? JSON.stringify(toolCallsLog) : undefined,
  });

  const updatedConversation = (await repo.getById(conversationId))!;

  return {
    userMessage: savedUserMsg,
    assistantMessage: savedAssistantMsg,
    conversation: updatedConversation,
  };
}

/**
 * Handle a message within a conversation context (streaming).
 * Saves user message, triggers streamText, and returns callback to save assistant message at finish.
 */
export async function streamMessageInConversation(
  conversationId: string,
  userMessage: string,
  onToolEvent?: (event: { type: 'tool-call' | 'tool-result'; name: string; toolCallId: string; args?: unknown; result?: unknown }) => void | Promise<void>,
): Promise<{
  isAi: boolean;
  userMessage: MessageRow;
  result?: any;
  reply?: string;
  toolCalls?: any[];
  saveAssistantMessage: (reply: string, toolCallsLog: any[]) => Promise<MessageRow>;
}> {
  const repo = getRepositories().conversations;

  // Persist user message
  const savedUserMsg = await repo.addMessage(conversationId, {
    role: "user",
    content: userMessage,
  });

  // Auto-generate title from first message
  const conversation = await repo.getById(conversationId);
  if (conversation && conversation.title === "New Chat" && conversation.messageCount <= 1) {
    const title = generateTitleFromMessage(userMessage);
    await repo.update(conversationId, { title });
  }

  // Load message history
  const history = await repo.getMessages(conversationId);
  const recentHistory = history.slice(-MAX_HISTORY_MESSAGES);

  const saveAssistantMessage = async (reply: string, toolCallsLog: any[]) => {
    return repo.addMessage(conversationId, {
      role: "assistant",
      content: reply,
      toolCalls: toolCallsLog.length > 0 ? JSON.stringify(toolCallsLog) : undefined,
    });
  };

  if (isAiConfigured()) {
    const messages: ModelMessage[] = [
      { role: "system", content: buildSystemPrompt("text", conversationId) },
      ...recentHistory.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
    ];

    try {
      const result = streamText({
        model: getModel(),
        messages,
        tools: wrapToolsForAI(getAllTools(), conversationId),
        stopWhen: stepCountIs(5),
        ...(onToolEvent
          ? {
              onStepFinish: async (step: any) => {
                const toolCalls = step.toolCalls ?? [];
                const toolResults = step.toolResults ?? [];
                for (const tc of toolCalls) {
                  await onToolEvent({
                    type: 'tool-call',
                    name: tc.toolName,
                    toolCallId: tc.toolCallId,
                    args: tc.input ?? tc.args,
                  });
                }
                for (const tr of toolResults) {
                  await onToolEvent({
                    type: 'tool-result',
                    name: tr.toolName,
                    toolCallId: tr.toolCallId,
                    result: tr.output ?? tr.result,
                  });
                }
              },
            }
          : {}),
      });

      return {
        isAi: true,
        userMessage: savedUserMsg,
        result,
        saveAssistantMessage,
      };
    } catch (err) {
      logError("streamMessageInConversation/streamText", err);
      const { code } = classifyError(err);
      throw Object.assign(new Error(extractErrorMessage(err)), { code });
    }
  } else {
    const localResult = await handleLocally(userMessage);
    return {
      isAi: false,
      userMessage: savedUserMsg,
      reply: localResult.reply,
      toolCalls: localResult.toolCalls,
      saveAssistantMessage,
    };
  }
}

export function streamChat(
  messages: ModelMessage[],
  mode: "text" | "voice" = "text",
  conversationId?: string,
  onToolEvent?: (event: { type: 'tool-call' | 'tool-result'; name: string; toolCallId: string; args?: unknown; result?: unknown }) => void | Promise<void>,
): ReturnType<typeof streamText> {
  try {
    return streamText({
      model: getModel(),
      system: buildSystemPrompt(mode, conversationId),
      messages,
      tools: wrapToolsForAI(getAllTools(), conversationId),
      stopWhen: stepCountIs(5),
      ...(onToolEvent
        ? {
            onStepFinish: async (step: any) => {
              const toolCalls = step.toolCalls ?? [];
              const toolResults = step.toolResults ?? [];
              for (const tc of toolCalls) {
                await onToolEvent({
                  type: 'tool-call',
                  name: tc.toolName,
                  toolCallId: tc.toolCallId,
                  args: tc.input ?? tc.args,
                });
              }
              for (const tr of toolResults) {
                await onToolEvent({
                  type: 'tool-result',
                  name: tr.toolName,
                  toolCallId: tr.toolCallId,
                  result: tr.output ?? tr.result,
                });
              }
            },
          }
        : {}),
    });
  } catch (err) {
    logError("streamChat", err);
    const { code } = classifyError(err);
    throw Object.assign(new Error(extractErrorMessage(err)), { code });
  }
}


/**
 * Legacy handler for backward compatibility (no conversation context).
 */
export async function handleMessage(userMessage: string): Promise<{
  reply: string;
  toolCalls: { name: string; args: unknown; result: unknown }[];
}> {
  if (!isAiConfigured()) {
    return handleLocally(userMessage);
  }

  const result = await generateText({
    model: getModel(),
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: userMessage }],
    tools: wrapToolsForAI(getAllTools()),
    stopWhen: stepCountIs(5),
  });

  const toolCallsLog: { name: string; args: unknown; result: unknown }[] = [];
  for (const step of result.steps ?? []) {
    for (const toolCall of step.toolCalls ?? []) {
      const toolResult = step.toolResults?.find((r) => r.toolCallId === toolCall.toolCallId);
      toolCallsLog.push({
        name: toolCall.toolName,
        args: "input" in toolCall ? toolCall.input : {},
        result: toolResult && "output" in toolResult ? toolResult.output : null,
      });
    }
  }

  return {
    reply: result.text,
    toolCalls: toolCallsLog,
  };
}
