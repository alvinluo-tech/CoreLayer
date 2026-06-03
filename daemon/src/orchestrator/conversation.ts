import { generateText, streamText, stepCountIs } from "ai";
import type { ModelMessage, Tool } from "ai";
import { ContextBuilder, MEMORY_MIN_SCORE } from "./context-builder.js";
import { compressConversation, createSummaryMessage } from "./compressor.js";
import { getAllTools } from "../tools/registry.js";
import { wrapToolsForAI } from "../runtime/ai-tool-wrapper.js";
import { env } from "../config/env.js";
import { configManager } from "../config/config-manager.js";
import { getModelGateway } from "../model/gateway.js";
import { getRepositories } from "../db/factory.js";
import type { MessageRow, ConversationRow, ScoredMemoryRow } from "../db/repository.js";
import { classifyError, extractErrorMessage, logError } from "../utils/errors.js";

// ---- IterationBudget ----

const BUDGET_WARNING_MSG = "[系统提示] 你已达到迭代次数上限，请整合已有信息并尽快结束回答。不要再调用工具。";

/**
 * Tracks agent loop step count and injects a pressure warning
 * when the loop reaches 80% of the configured budget.
 * The warning is injected exactly once into the next tool result.
 */
export class IterationBudget {
  private readonly threshold: number;
  private currentStep = 0;
  private warned = false;

  constructor(maxSteps: number) {
    this.threshold = Math.floor(maxSteps * 0.8);
  }

  /**
   * Record a completed step. Returns true if a warning should be injected.
   */
  advance(): boolean {
    this.currentStep++;
    if (!this.warned && this.currentStep >= this.threshold) {
      this.warned = true;
      return true;
    }
    return false;
  }

  get shouldWarn(): boolean {
    return this.warned && this.currentStep >= this.threshold;
  }

  get step(): number {
    return this.currentStep;
  }
}

/**
 * Inject a budget warning into the tool results of a step event.
 * Returns a new array with the warning appended to the first tool result.
 */
interface ToolResultEntry {
  toolName?: string;
  toolCallId?: string;
  output?: unknown;
  result?: unknown;
  [key: string]: unknown;
}

export function injectBudgetWarning(toolResults: ToolResultEntry[]): ToolResultEntry[] {
  if (toolResults.length === 0) return toolResults;
  const first = toolResults[0]!;
  const warnedResult: ToolResultEntry = "output" in first
    ? { ...first, output: `${BUDGET_WARNING_MSG}\n\n${String(first.output ?? "")}` }
    : { ...first, result: `${BUDGET_WARNING_MSG}\n\n${String(first.result ?? "")}` };
  return [warnedResult, ...toolResults.slice(1)];
}

// ---- Empty Response Guard ----

/**
 * If the model returns empty text but has reasoning content (thinking models),
 * fall back to reasoning as the response text.
 * Returns the original result if text is non-empty.
 */
export function guardEmptyResponse(result: { text: string; reasoning?: string | { text: string }[] }): string {
  if (result.text && result.text.trim().length > 0) return result.text;

  const reasoning = result.reasoning;
  if (!reasoning) return result.text;

  if (typeof reasoning === "string" && reasoning.trim().length > 0) return reasoning;
  if (Array.isArray(reasoning)) {
    const combined = reasoning.map((r) => r.text).filter(Boolean).join("\n");
    if (combined.trim().length > 0) return combined;
  }

  return result.text;
}

// ---- Anthropic Prompt Caching Helpers ----

export const CACHE_CONTROL = { type: "ephemeral" } as const;

/**
 * Apply cacheControl to the system message (first message) and the last tool.
 * Returns a new messages array and a new tools object — immutable.
 */
export function applyCacheControl(
  messages: ModelMessage[],
  tools: Record<string, Tool>,
): { messages: ModelMessage[]; tools: Record<string, Tool> } {
  // Cache the system message
  const cachedMessages = messages.map((msg, i) =>
    i === 0 && msg.role === "system"
      ? { ...msg, providerOptions: { anthropic: { cacheControl: CACHE_CONTROL } } }
      : msg,
  );

  // Cache the last tool
  const toolEntries = Object.entries(tools);
  if (toolEntries.length === 0) return { messages: cachedMessages, tools };

  const cachedTools: Record<string, Tool> = {};
  for (let i = 0; i < toolEntries.length; i++) {
    const [name, tool] = toolEntries[i]!;
    cachedTools[name] =
      i === toolEntries.length - 1
        ? { ...tool, providerOptions: { anthropic: { cacheControl: CACHE_CONTROL } } }
        : tool;
  }

  return { messages: cachedMessages, tools: cachedTools };
}

/**
 * Extract and log Anthropic cache hit/miss stats from providerMetadata.
 */
export function logCacheStats(providerMetadata: Record<string, unknown> | undefined, context: string): void {
  const anthropic = providerMetadata?.anthropic as Record<string, number> | undefined;
  if (!anthropic) return;
  const creation = anthropic.cacheCreationInputTokens ?? 0;
  const read = anthropic.cacheReadInputTokens ?? 0;
  if (creation === 0 && read === 0) return;
  const hitRate = read > 0 ? "hit" : "miss";
  console.info(`[Jarvis][Cache/${context}] creation=${creation} read=${read} status=${hitRate}`);
}

// ---- Model Routing ----

/** Infer task context from message content for model selection. */
function inferTaskContext(userMessage: string, hasTools: boolean, historyLength: number): {
  mode?: 'text' | 'voice';
  expectedAnswerLength?: 'short' | 'medium' | 'long';
  requiresToolCalling?: boolean;
  requiresLongContext?: boolean;
} {
  const msgLen = userMessage.length;
  return {
    expectedAnswerLength: msgLen < 50 ? 'short' : msgLen > 300 ? 'long' : 'medium',
    requiresToolCalling: hasTools,
    requiresLongContext: historyLength > 40,
  };
}

/** Select model via ModelGateway, falling back to activeModel on failure. */
function selectModelForConversation(
  userMessage: string,
  hasTools: boolean,
  historyLength: number,
): string {
  try {
    const gateway = getModelGateway();
    const criteria = inferTaskContext(userMessage, hasTools, historyLength);
    const selected = gateway.selectModel(criteria);
    const profile = gateway.getProfile(selected);
    console.info(`[Router] selected model: ${selected} (${profile?.displayName ?? selected})`);
    return selected;
  } catch (err) {
    logError("selectModelForConversation/fallback", err);
    return configManager.getActiveModel();
  }
}

/**
 * Fetch relevant memories for context injection.
 * Uses scored search when a query is available for relevance-based retrieval.
 */
async function fetchRelevantMemories(query?: string, limit = 15): Promise<ScoredMemoryRow[]> {
  try {
    const repo = getRepositories().memories;
    let scored: ScoredMemoryRow[];
    if (query) {
      scored = await repo.searchScored(query, "default", limit);
    } else {
      const all = await repo.getAll();
      scored = all
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit)
        .map((m) => ({ ...m, score: 0 }));
    }
    const before = scored.length;
    const filtered = scored.filter((m) => m.score >= MEMORY_MIN_SCORE);
    const removed = before - filtered.length;
    if (removed > 0) {
      console.info(`[Memory] filtered ${removed} low-relevance memories (score < ${MEMORY_MIN_SCORE})`);
    }
    return filtered;
  } catch {
    return [];
  }
}

/**
 * Extract the most recent conversation summary from history.
 * Summary messages have role "system" and start with "[对话摘要".
 */
function extractSummaryFromHistory(history: MessageRow[]): string | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === "system" && msg.content.startsWith("[对话摘要")) {
      // Strip the prefix header
      const idx = msg.content.indexOf("\n\n");
      return idx >= 0 ? msg.content.slice(idx + 2) : msg.content;
    }
  }
  return undefined;
}

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

  // Load message history and assemble context
  const history = await repo.getMessages(conversationId);
  const memories = await fetchRelevantMemories(userMessage);
  const summary = extractSummaryFromHistory(history);

  const selectedModel = selectModelForConversation(userMessage, true, history.length);

  const builder = new ContextBuilder({
    mode: "text",
    conversationId,
    modelName: selectedModel,
    userMessage,
  });
  if (summary) builder.withSummary(summary);

  const context = await builder.build(memories, history);

  let reply: string;
  let toolCallsLog: { name: string; args: unknown; result: unknown }[] = [];

  if (isAiConfigured()) {
    try {
      const rawTools = wrapToolsForAI(getAllTools(), conversationId);
      const { messages: aiMessages, tools: aiTools } = context.cacheEnabled
        ? applyCacheControl(context.messages, rawTools)
        : { messages: context.messages, tools: rawTools };

      const maxSteps = configManager.getMaxSteps();
      const result = await generateText({
        model: getModelGateway().getModel(selectedModel),
        messages: aiMessages,
        tools: aiTools,
        stopWhen: stepCountIs(maxSteps),
      });

      logCacheStats(result.providerMetadata as Record<string, unknown> | undefined, "handleMessage");

      reply = guardEmptyResponse(result as { text: string; reasoning?: string | { text: string }[] });

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

  // Trigger compression if needed (async, non-blocking, after assistant message saved)
  if (context.shouldCompress && isAiConfigured()) {
    repo.getMessages(conversationId)
      .then((currentHistory) => compressConversation(currentHistory, conversationId))
      .then(async (compaction) => {
        if (compaction.summary && compaction.compressedMessages.length > 0) {
          const summaryMsg = createSummaryMessage(
            conversationId,
            compaction.summary,
            compaction.compressedMessages.length,
          );
          await repo.addMessage(conversationId, summaryMsg);
        }
      })
      .catch((err) => {
        logError("handleMessageInConversation/compress", err);
      });
  }

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

  // Load message history and assemble context
  const history = await repo.getMessages(conversationId);
  const memories = await fetchRelevantMemories(userMessage);
  const summary = extractSummaryFromHistory(history);

  const selectedModel = selectModelForConversation(userMessage, true, history.length);

  const builder = new ContextBuilder({
    mode: "text",
    conversationId,
    modelName: selectedModel,
    userMessage,
  });
  if (summary) builder.withSummary(summary);

  const context = await builder.build(memories, history);

  const saveAssistantMessage = async (reply: string, toolCallsLog: any[]) => {
    // Save assistant message
    const msg = await repo.addMessage(conversationId, {
      role: "assistant",
      content: reply,
      toolCalls: toolCallsLog.length > 0 ? JSON.stringify(toolCallsLog) : undefined,
    });

    // Trigger compression if needed after response is saved
    // Re-fetch messages to include the latest assistant reply
    if (context.shouldCompress && isAiConfigured()) {
      repo.getMessages(conversationId)
        .then((currentHistory) => compressConversation(currentHistory, conversationId))
        .then(async (compaction) => {
          if (compaction.summary && compaction.compressedMessages.length > 0) {
            const summaryMsg = createSummaryMessage(
              conversationId,
              compaction.summary,
              compaction.compressedMessages.length,
            );
            await repo.addMessage(conversationId, summaryMsg);
          }
        })
        .catch((err) => {
          logError("streamMessageInConversation/compress", err);
        });
    }

    return msg;
  };

  if (isAiConfigured()) {
    try {
      const rawTools = wrapToolsForAI(getAllTools(), conversationId);
      const { messages: aiMessages, tools: aiTools } = context.cacheEnabled
        ? applyCacheControl(context.messages, rawTools)
        : { messages: context.messages, tools: rawTools };

      const maxSteps = configManager.getMaxSteps();
      const budget = new IterationBudget(maxSteps);

      // Token usage accumulator
      const tokenUsage = { promptTokens: 0, completionTokens: 0 };

      // Set up stream timeout via AbortController
      const controller = new AbortController();
      const streamTimeout = configManager.getStreamTimeout();
      const timeoutId = setTimeout(() => {
        logError(`[Stream] timed out after ${streamTimeout}ms`, new Error("stream timeout"));
        controller.abort();
      }, streamTimeout);

      const result = streamText({
        model: getModelGateway().getModel(selectedModel),
        messages: aiMessages,
        tools: aiTools,
        stopWhen: stepCountIs(maxSteps),
        abortSignal: controller.signal,
        onFinish: async (event: any) => {
          clearTimeout(timeoutId);
          logCacheStats(event.providerMetadata as Record<string, unknown> | undefined, "streamMessage");
          // Persist accumulated token usage
          if (tokenUsage.promptTokens > 0 || tokenUsage.completionTokens > 0) {
            try {
              repo.updateTokenUsage(conversationId, tokenUsage.promptTokens, tokenUsage.completionTokens);
              console.info(`[Tokens] conversation ${conversationId}: prompt=${tokenUsage.promptTokens} completion=${tokenUsage.completionTokens}`);
            } catch (err) {
              logError("onFinish/updateTokenUsage", err);
            }
          }
        },
        onStepFinish: async (step: any) => {
          // Accumulate token usage from each step
          if (step.usage) {
            tokenUsage.promptTokens += step.usage.promptTokens ?? 0;
            tokenUsage.completionTokens += step.usage.completionTokens ?? 0;
          }

          const toolCalls = step.toolCalls ?? [];
          let toolResults = step.toolResults ?? [];

          // Track iteration budget and inject warning if needed
          if (budget.advance()) {
            toolResults = injectBudgetWarning(toolResults);
          }

          if (onToolEvent) {
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
          }
        },
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

export async function streamChat(
  messages: ModelMessage[],
  mode: "text" | "voice" = "text",
  conversationId?: string,
  onToolEvent?: (event: { type: 'tool-call' | 'tool-result'; name: string; toolCallId: string; args?: unknown; result?: unknown }) => void | Promise<void>,
): Promise<ReturnType<typeof streamText>> {
  try {
    const selectedModel = selectModelForConversation(messages[0]?.content?.toString() ?? "", false, 0);

    const builder = new ContextBuilder({
      mode,
      conversationId,
      modelName: selectedModel,
    });
    // streamChat doesn't have history or memories — build minimal context
    const context = await builder.build([], []);

    const rawTools = wrapToolsForAI(getAllTools(), conversationId);
    const aiTools = context.cacheEnabled
      ? applyCacheControl([], rawTools).tools
      : rawTools;

    const systemMessage = context.cacheEnabled
      ? { role: "system" as const, content: context.messages[0].content as string, providerOptions: { anthropic: { cacheControl: CACHE_CONTROL } } }
      : context.messages[0].content as string;

    const maxSteps = configManager.getMaxSteps();
    const budget = new IterationBudget(maxSteps);

    return streamText({
      model: getModelGateway().getModel(selectedModel),
      system: systemMessage,
      messages,
      tools: aiTools,
      stopWhen: stepCountIs(maxSteps),
      onFinish: async (event: any) => {
        logCacheStats(event.providerMetadata as Record<string, unknown> | undefined, "streamChat");
      },
      ...(onToolEvent
        ? {
            onStepFinish: async (step: any) => {
              const toolCalls = step.toolCalls ?? [];
              let toolResults = step.toolResults ?? [];

              // Track iteration budget and inject warning if needed
              if (budget.advance()) {
                toolResults = injectBudgetWarning(toolResults);
              }

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

  const selectedModel = selectModelForConversation(userMessage, true, 0);

  const builder = new ContextBuilder({
    mode: "text",
    modelName: selectedModel,
    userMessage,
  });
  const context = await builder.build([], []);

  const rawTools = wrapToolsForAI(getAllTools());
  const aiTools = context.cacheEnabled
    ? applyCacheControl([], rawTools).tools
    : rawTools;

  const systemMessage = context.cacheEnabled
    ? { role: "system" as const, content: context.messages[0].content as string, providerOptions: { anthropic: { cacheControl: CACHE_CONTROL } } }
    : context.messages[0].content as string;

  const maxSteps = configManager.getMaxSteps();
  const result = await generateText({
    model: getModelGateway().getModel(selectedModel),
    system: systemMessage,
    messages: [{ role: "user", content: userMessage }],
    tools: aiTools,
    stopWhen: stepCountIs(maxSteps),
  });

  logCacheStats(result.providerMetadata as Record<string, unknown> | undefined, "handleMessage");

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
    reply: guardEmptyResponse(result as { text: string; reasoning?: string | { text: string }[] }),
    toolCalls: toolCallsLog,
  };
}
