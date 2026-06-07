import { generateText, streamText, stepCountIs } from "ai";
import type { ModelMessage, Tool } from "ai";
import { ContextBuilder, MEMORY_MIN_SCORE } from "./context-builder.js";
import { compressConversation, createSummaryMessage, extractMemoriesFromTurn } from "./compressor.js";
import { getAllTools, wrapToolsForAI } from "../../tool/public-api.js";
import { isTaskComplete } from "../../../workspaces/task-status.js";

import { configManager } from "../../../config/config-manager.js";
import { getModelGateway } from "../../../gateways/model/gateway.js";
import { getRepositories } from "../../../persistence/factory.js";
import type { MessageRow, ConversationRow, ScoredMemoryRow } from "../../../persistence/repository.js";
import { classifyError, extractErrorMessage, logError } from "../../../shared/errors.js";
import { recordActivity } from "../../scheduler/scheduler.js";

// ---- Compression Lock & Cooldown ----

/** Per-conversation compression state to prevent concurrent/duplicate compressions */
const compressionState = new Map<string, { inProgress: boolean; lastCompressedAt: number; compressCountThisTurn: number }>();

/** Minimum interval between compressions for the same conversation (ms) */
const COMPRESSION_COOLDOWN_MS = 30_000;

/** Maximum compressions allowed per conversation turn (inspired by OpenClaw's max 3 overflow compactions) */
const MAX_COMPRESSIONS_PER_TURN = 3;

function shouldSkipCompression(conversationId: string): boolean {
  const state = compressionState.get(conversationId);
  if (!state) return false;
  if (state.inProgress) return true;
  if (Date.now() - state.lastCompressedAt < COMPRESSION_COOLDOWN_MS) return true;
  if (state.compressCountThisTurn >= MAX_COMPRESSIONS_PER_TURN) return true;
  return false;
}

function markCompressionStarted(conversationId: string): void {
  const existing = compressionState.get(conversationId);
  compressionState.set(conversationId, {
    inProgress: true,
    lastCompressedAt: existing?.lastCompressedAt ?? 0,
    compressCountThisTurn: (existing?.compressCountThisTurn ?? 0) + 1,
  });
}

function markCompressionFinished(conversationId: string): void {
  const state = compressionState.get(conversationId);
  if (state) {
    state.inProgress = false;
    state.lastCompressedAt = Date.now();
  } else {
    compressionState.set(conversationId, { inProgress: false, lastCompressedAt: Date.now(), compressCountThisTurn: 0 });
  }
}

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

const LOOP_BREAKER_MSG =
  "[系统提示] 检测到工具调用循环。请停止调用工具，基于已有信息直接回答用户问题。";

export function injectLoopBreakerWarning(toolResults: ToolResultEntry[]): ToolResultEntry[] {
  if (toolResults.length === 0) return toolResults;
  const first = toolResults[0]!;
  const warnedResult: ToolResultEntry = "output" in first
    ? { ...first, output: `${LOOP_BREAKER_MSG}\n\n${String(first.output ?? "")}` }
    : { ...first, result: `${LOOP_BREAKER_MSG}\n\n${String(first.result ?? "")}` };
  return [warnedResult, ...toolResults.slice(1)];
}

// ---- Empty Response Guard ----

// ---- Force Answer Detector ----

// ---- Loop Breaker (Odysseus-inspired) ----

/** Same tool + similar args this many times → stuck in a loop */
const STUCK_THRESHOLD = 3;
/** Single tool called this many times total → excessive usage */
const EXCESSIVE_THRESHOLD = 10;

interface ToolCallRecord {
  callCount: number;
  lastArgs: string;
  consecutiveSimilar: number;
}

/**
 * Detects tool-loop pathologies:
 * 1. Same tool called repeatedly with similar args (stuck)
 * 2. Single tool called excessively many times
 *
 * Inspired by Odysseus loop-breaker: 4 stuck rounds or 15 single-tool calls.
 * Our thresholds are tighter (3 stuck, 10 excessive) because we have IterationBudget
 * as the outer guardrail and ForceAnswerDetector as the inner one.
 */
export class LoopBreaker {
  private tools = new Map<string, ToolCallRecord>();

  /**
   * Record a tool call. Returns { stuck, excessive } flags.
   */
  recordToolCall(toolName: string, args: unknown): { stuck: boolean; excessive: boolean } {
    const argsStr = JSON.stringify(args ?? {});
    const existing = this.tools.get(toolName);

    if (existing) {
      existing.callCount++;
      const isSimilar = existing.lastArgs === argsStr;
      existing.consecutiveSimilar = isSimilar ? existing.consecutiveSimilar + 1 : 0;
      existing.lastArgs = argsStr;
    } else {
      this.tools.set(toolName, {
        callCount: 1,
        lastArgs: argsStr,
        consecutiveSimilar: 0,
      });
    }

    const record = this.tools.get(toolName)!;
    return {
      stuck: record.consecutiveSimilar >= STUCK_THRESHOLD,
      excessive: record.callCount >= EXCESSIVE_THRESHOLD,
    };
  }

  /** Reset all tracking state (call at start of new turn) */
  reset(): void {
    this.tools.clear();
  }
}

/** Number of consecutive tool-only rounds before force answer triggers */
const FORCE_ANSWER_ROUNDS = 3;

const FORCE_ANSWER_MSG =
  "[系统提示] 你已连续调用工具3轮未生成文本。请基于已获取的信息直接回答用户问题，不要再调用工具。";

/**
 * Tracks consecutive tool-only rounds in the agent loop.
 * When the model calls tools for 3+ rounds without generating any text,
 * the loop should stop and force a text-only follow-up call.
 */
export class ForceAnswerDetector {
  private consecutiveToolOnly = 0;

  /**
   * Record a completed step. Returns true if force answer should trigger.
   */
  recordStep(step: { text?: string; toolCalls?: unknown[] }): boolean {
    const hasToolCalls = (step.toolCalls?.length ?? 0) > 0;
    const hasText = (step.text?.trim().length ?? 0) > 0;

    if (hasToolCalls && !hasText) {
      this.consecutiveToolOnly++;
    } else {
      this.consecutiveToolOnly = 0;
    }

    return this.consecutiveToolOnly >= FORCE_ANSWER_ROUNDS;
  }

  get count(): number {
    return this.consecutiveToolOnly;
  }

  reset(): void {
    this.consecutiveToolOnly = 0;
  }
}

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
  requiresPrivacy?: boolean;
  requiresVision?: boolean;
} {
  const msgLen = userMessage.length;

  // Privacy-sensitive: messages about passwords, personal data, API keys, credentials
  const requiresPrivacy =
    /\b(password|passwd|密码|口令|api[_ ]?key|secret|token|credential|私密|隐私|个人|身份证|id[_ ]?card)\b/i.test(
      userMessage
    );

  // Vision: messages referencing images, screenshots, photos, visual analysis
  const requiresVision =
    /\b(图片|图像|截图|照片|看图|识别图|image|screenshot|photo|picture|vision|analyze\s+image)\b/i.test(
      userMessage
    ) || /!\[.*\]\(.*\)/.test(userMessage); // markdown image syntax

  return {
    expectedAnswerLength: msgLen < 50 ? 'short' : msgLen > 300 ? 'long' : 'medium',
    requiresToolCalling: hasTools,
    requiresLongContext: historyLength > 40,
    requiresPrivacy: requiresPrivacy || undefined,
    requiresVision: requiresVision || undefined,
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
async function fetchRelevantMemories(
  query?: string,
  limit = 15,
  scope?: { type: "user" | "workspace" | "project" | "agent" | "task" | "conversation"; id: string } | null,
): Promise<ScoredMemoryRow[]> {
  try {
    const repo = getRepositories().memories;
    let scored: ScoredMemoryRow[];
    if (query) {
      scored = await repo.fetchRelevantMemories(query, scope ?? null, "default", limit);
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
  const creds = configManager.getCredentials();
  return Object.values(creds).some((v) => v);
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

/** Options for conversation message handling (used by TICK, scheduled tasks, etc.) */
export interface ConversationOptions {
  modelOverride?: string;
  providerOverride?: string;
  systemPromptOverride?: string;
  /** Runtime context for tool approval and audit */
  runtimeContext?: {
    runId?: string;
    projectId?: string;
    mode?: string;
  };
  /** Called when memories are fetched for context injection */
  onMemoryRead?: (memoryIds: string[]) => void;
  /** Called when memories are extracted and written after a turn */
  onMemoryWritten?: (memoryIds: string[]) => void;
}

/**
 * Handle a message within a conversation context (non-streaming).
 * Uses Vercel AI SDK generateText with automatic tool calling.
 */
export async function handleMessageInConversation(
  conversationId: string,
  userMessage: string,
  options?: ConversationOptions,
): Promise<{
  userMessage: MessageRow;
  assistantMessage: MessageRow;
  conversation: ConversationRow;
}> {
  const streamResult = await streamMessageInConversation(conversationId, userMessage, undefined, undefined, options);

  // Non-AI local fallback: save and return directly
  if (!streamResult.isAi) {
    const savedAssistantMsg = await streamResult.saveAssistantMessage(
      streamResult.reply ?? "",
      streamResult.toolCalls ?? [],
    );
    const conversation = (await getRepositories().conversations.getById(conversationId))!;
    return {
      userMessage: streamResult.userMessage,
      assistantMessage: savedAssistantMsg,
      conversation,
    };
  }

  // AI path: consume the stream to get full text
  let fullText = "";
  const r = streamResult.result as { fullStream: AsyncIterable<{ type: string; text?: string }> };
  for await (const event of r.fullStream) {
    if (event.type === "text-delta" && event.text) {
      fullText += event.text;
    }
  }

  // Handle force answer if needed
  if (streamResult.needsForceAnswer && streamResult.forceAnswerFollowUp) {
    const forcedText = await streamResult.forceAnswerFollowUp();
    if (forcedText) {
      fullText = forcedText;
    }
  }

  // Save assistant message (triggers compression internally)
  const savedAssistantMsg = await streamResult.saveAssistantMessage(
    fullText,
    streamResult.toolCallsLog ?? [],
  );

  const conversation = (await getRepositories().conversations.getById(conversationId))!;

  return {
    userMessage: streamResult.userMessage,
    assistantMessage: savedAssistantMsg,
    conversation,
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
  abortController?: AbortController,
  options?: ConversationOptions,
): Promise<{
  isAi: boolean;
  userMessage: MessageRow;
  result?: unknown;
  reply?: string;
  toolCalls?: unknown[];
  toolCallsLog?: { name: string; args: unknown; result: unknown }[];
  abortController?: AbortController;
  needsForceAnswer?: boolean;
  forceAnswerFollowUp?: () => Promise<string>;
  saveAssistantMessage: (reply: string, toolCallsLog: unknown[]) => Promise<MessageRow>;
}> {
  recordActivity();
  const repo = getRepositories().conversations;

  // Reset compression count for new turn
  const existingState = compressionState.get(conversationId);
  if (existingState) {
    existingState.compressCountThisTurn = 0;
  }

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

  // Build scope for memory retrieval from conversation context
  let memoryScope: { type: "user" | "workspace" | "project" | "agent" | "task" | "conversation"; id: string } | null = null;
  if (conversation?.projectId) {
    memoryScope = { type: "project", id: conversation.projectId };
  } else if (conversation?.workspaceId) {
    memoryScope = { type: "workspace", id: conversation.workspaceId };
  }

  const memories = await fetchRelevantMemories(userMessage, 15, memoryScope);
  if (memories.length > 0 && options?.onMemoryRead) {
    options.onMemoryRead(memories.map((m) => m.id));
  }
  const summary = extractSummaryFromHistory(history);

  const selectedModel = options?.modelOverride ?? selectModelForConversation(userMessage, true, history.length);

  // Update conversation model if it changed
  if (conversation && conversation.modelUsed !== selectedModel) {
    try {
      await repo.update(conversationId, { modelUsed: selectedModel });
    } catch (err) {
      logError("streamMessageInConversation/updateModel", err);
    }
  }

  const builder = new ContextBuilder({
    mode: "text",
    conversationId,
    modelName: selectedModel,
    userMessage,
    systemPromptOverride: options?.systemPromptOverride,
  });
  if (summary) builder.withSummary(summary);

  const context = await builder.build(memories, history);

  const saveAssistantMessage = async (reply: string, toolCallsLog: unknown[]) => {
    // Save assistant message
    const msg = await repo.addMessage(conversationId, {
      role: "assistant",
      content: reply,
      toolCalls: toolCallsLog.length > 0 ? JSON.stringify(toolCallsLog) : undefined,
    });

    // Trigger compression if needed after response is saved
    // Re-fetch messages to include the latest assistant reply
    if (context.shouldCompress && isAiConfigured() && !shouldSkipCompression(conversationId)) {
      markCompressionStarted(conversationId);
      repo.getMessages(conversationId)
        .then((currentHistory) => compressConversation(currentHistory, conversationId))
        .then(async (compaction) => {
          if (compaction.summary && compaction.compressedMessages.length > 0) {
            // Mark compressed messages instead of deleting them
            const compressedIds = compaction.compressedMessages.map((m) => m.id);
            await repo.markMessagesCompressed(compressedIds);

            const summaryMsg = createSummaryMessage(
              conversationId,
              compaction.summary,
              compaction.compressedMessages.length,
            );
            await repo.addMessage(conversationId, summaryMsg);
          }
          // Store extracted preferences as tier:'preference' memories
          if (compaction.extractedPreferences.length > 0) {
            const { memories } = getRepositories();
            await memories.upsertPreferences(compaction.extractedPreferences);
          }
        })
        .catch((err) => {
          logError("streamMessageInConversation/compress", err);
        })
        .finally(() => {
          markCompressionFinished(conversationId);
        });
    }

    // Per-turn memory extraction (fire-and-forget, BaiLongma Recognizer pattern)
    if (isAiConfigured()) {
      extractMemoriesFromTurn(userMessage, reply)
        .then(async (extracted) => {
          if (extracted.length > 0) {
            const { memories } = getRepositories();
            const writtenIds: string[] = [];
            for (const mem of extracted) {
              const saved = await memories.upsert({
                key: mem.key,
                value: mem.value,
                type: mem.type,
                scopeType: memoryScope?.type,
                scopeId: memoryScope?.id,
              });
              writtenIds.push(saved.id);
            }
            options?.onMemoryWritten?.(writtenIds);
            console.info(`[Memory] extracted ${extracted.length} memories from turn`);
          }
        })
        .catch((err) => {
          logError("streamMessageInConversation/extractMemories", err);
        });
    }

    return msg;
  };

  if (isAiConfigured()) {
    try {
      const rawTools = wrapToolsForAI(getAllTools(), {
        conversationId,
        runId: options?.runtimeContext?.runId,
        projectId: options?.runtimeContext?.projectId,
        mode: options?.runtimeContext?.mode as "chat" | "voice" | "tick" | "scheduled" | "workflow" | "regenerate",
      });
      const { messages: aiMessages, tools: aiTools } = context.cacheEnabled
        ? applyCacheControl(context.messages, rawTools)
        : { messages: context.messages, tools: rawTools };

      const maxSteps = configManager.getMaxSteps();
      const budget = new IterationBudget(maxSteps);
      const forceDetector = new ForceAnswerDetector();
      const loopBreaker = new LoopBreaker();
      let loopDetected = false;

      // Token usage accumulator
      const tokenUsage = { promptTokens: 0, completionTokens: 0 };

      // Tool calls log accumulator (consumed by wrapper and SSE caller)
      const toolCallsLog: { name: string; args: unknown; result: unknown }[] = [];

      // Set up turn timeout via AbortController (watchdog)
      const controller = abortController ?? new AbortController();
      const turnTimeout = configManager.getTurnTimeout();
      const timeoutId = setTimeout(() => {
        logError(`[Turn] timed out after ${turnTimeout}ms`, new Error("turn timeout"));
        controller.abort();
      }, turnTimeout);

      const result = streamText({
        model: getModelGateway().getModel(selectedModel),
        messages: aiMessages,
        tools: aiTools,
        stopWhen: stepCountIs(maxSteps),
        abortSignal: controller.signal,
        onFinish: async (event: unknown) => {
          clearTimeout(timeoutId);
          const e = event as Record<string, unknown>;
          logCacheStats(e.providerMetadata as Record<string, unknown> | undefined, "streamMessage");
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
        onStepFinish: async (step: unknown) => {
          const s = step as Record<string, unknown>;
          // Accumulate token usage from each step
          const usage = s.usage as Record<string, unknown> | undefined;
          if (usage) {
            tokenUsage.promptTokens += (usage.inputTokens as number) ?? 0;
            tokenUsage.completionTokens += (usage.outputTokens as number) ?? 0;
          }

          const toolCalls = (s.toolCalls ?? []) as Array<Record<string, unknown>>;
          let toolResults = (s.toolResults ?? []) as Array<Record<string, unknown>>;

          // Track iteration budget and inject warning if needed
          if (budget.advance()) {
            toolResults = injectBudgetWarning(toolResults);
          }

          // Track force answer: consecutive tool-only rounds
          forceDetector.recordStep({ text: s.text as string, toolCalls: s.toolCalls as Record<string, unknown>[] });

          // Track loop breakage: stuck (same tool + similar args) or excessive (single tool overuse)
          for (const tc of toolCalls) {
            const { stuck, excessive } = loopBreaker.recordToolCall(tc.toolName as string, tc.input ?? tc.args);
            if (stuck || excessive) {
              loopDetected = true;
            }
          }
          if (loopDetected) {
            toolResults = injectLoopBreakerWarning(toolResults);
          }

          if (onToolEvent) {
            for (const tc of toolCalls) {
              await onToolEvent({
                type: 'tool-call',
                name: tc.toolName as string,
                toolCallId: tc.toolCallId as string,
                args: tc.input ?? tc.args,
              });
            }
            for (const tr of toolResults) {
              await onToolEvent({
                type: 'tool-result',
                name: tr.toolName as string,
                toolCallId: tr.toolCallId as string,
                result: tr.output ?? tr.result,
              });
            }
          }

          // Accumulate tool calls log for callers that need it after stream completes
          for (const tc of toolCalls) {
            toolCallsLog.push({
              name: tc.toolName as string,
              args: tc.input ?? tc.args,
              result: null,
            });
          }
          for (const tr of toolResults) {
            const entry = toolCallsLog.find((e) => e.name === tr.toolName && e.result === null);
            if (entry) {
              entry.result = tr.output ?? tr.result;
            }
          }
        },
      });

      return {
        isAi: true,
        userMessage: savedUserMsg,
        result,
        toolCallsLog,
        abortController: controller,
        needsForceAnswer: forceDetector.count >= FORCE_ANSWER_ROUNDS || loopDetected,
        forceAnswerFollowUp: (forceDetector.count >= FORCE_ANSWER_ROUNDS || loopDetected)
          ? async () => {
              console.info("[ForceAnswer] stream ended on tool loop, forcing text response");
              const forced = await generateText({
                model: getModelGateway().getModel(selectedModel),
                messages: [
                  ...aiMessages,
                  { role: "assistant" as const, content: "" },
                  { role: "user" as const, content: FORCE_ANSWER_MSG },
                ],
              });
              if (forced.totalUsage) {
                try {
                  repo.updateTokenUsage(
                    conversationId,
                    forced.totalUsage.inputTokens ?? 0,
                    forced.totalUsage.outputTokens ?? 0,
                  );
                } catch (err) {
                  logError("forceAnswerFollowUp/updateTokenUsage", err);
                }
              }
              return guardEmptyResponse(forced as { text: string; reasoning?: string | { text: string }[] });
            }
          : undefined,
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
      toolCallsLog: localResult.toolCalls,
      saveAssistantMessage,
    };
  }
}

export async function streamChat(
  messages: ModelMessage[],
  mode: "text" | "voice" = "text",
  conversationId?: string,
  onToolEvent?: (event: { type: 'tool-call' | 'tool-result'; name: string; toolCallId: string; args?: unknown; result?: unknown }) => void | Promise<void>,
  abortController?: AbortController,
  runtimeContext?: { runId?: string; projectId?: string; mode?: string },
  onMemoryRead?: (memoryIds: string[]) => void,
): Promise<{ stream: ReturnType<typeof streamText>; abortController: AbortController }> {
  try {
    const selectedModel = selectModelForConversation(messages[0]?.content?.toString() ?? "", false, 0);

    // Build memory scope from conversation context
    let memoryScope: { type: "user" | "workspace" | "project" | "agent" | "task" | "conversation"; id: string } | null = null;
    if (conversationId) {
      const conversation = await getRepositories().conversations.getById(conversationId);
      if (conversation?.projectId) {
        memoryScope = { type: "project", id: conversation.projectId };
      } else if (conversation?.workspaceId) {
        memoryScope = { type: "workspace", id: conversation.workspaceId };
      }
    }

    // Fetch relevant memories for streaming path
    const userMessage = messages[messages.length - 1]?.content?.toString() ?? "";
    const memories = await fetchRelevantMemories(userMessage, 15, memoryScope);
    if (memories.length > 0 && onMemoryRead) {
      onMemoryRead(memories.map((m) => m.id));
    }

    const builder = new ContextBuilder({
      mode,
      conversationId,
      modelName: selectedModel,
    });
    const context = await builder.build(memories, []);

    const rawTools = wrapToolsForAI(getAllTools(), {
      conversationId,
      runId: runtimeContext?.runId,
      projectId: runtimeContext?.projectId,
      mode: runtimeContext?.mode as "chat" | "voice" | "tick" | "scheduled" | "workflow" | "regenerate",
    });
    const aiTools = context.cacheEnabled
      ? applyCacheControl([], rawTools).tools
      : rawTools;

    const systemMessage = context.cacheEnabled
      ? { role: "system" as const, content: context.messages[0].content as string, providerOptions: { anthropic: { cacheControl: CACHE_CONTROL } } }
      : context.messages[0].content as string;

    const maxSteps = configManager.getMaxSteps();
    const budget = new IterationBudget(maxSteps);

    const controller = abortController ?? new AbortController();
    const streamTimeout = configManager.getStreamTimeout();
    const timeoutId = setTimeout(() => {
      logError(`[Stream] timed out after ${streamTimeout}ms`, new Error("stream timeout"));
      controller.abort();
    }, streamTimeout);

    const stream = streamText({
      model: getModelGateway().getModel(selectedModel),
      system: systemMessage,
      messages,
      tools: aiTools,
      stopWhen: stepCountIs(maxSteps),
      abortSignal: controller.signal,
      onFinish: async (event: unknown) => {
        clearTimeout(timeoutId);
        const e = event as Record<string, unknown>;
        logCacheStats(e.providerMetadata as Record<string, unknown> | undefined, "streamChat");
      },
      ...(onToolEvent
        ? {
            onStepFinish: async (step: unknown) => {
              const s = step as Record<string, unknown>;
              const toolCalls = (s.toolCalls ?? []) as Array<Record<string, unknown>>;
              let toolResults = (s.toolResults ?? []) as Array<Record<string, unknown>>;

              // Track iteration budget and inject warning if needed
              if (budget.advance()) {
                toolResults = injectBudgetWarning(toolResults);
              }

              for (const tc of toolCalls) {
                await onToolEvent({
                  type: 'tool-call',
                  name: tc.toolName as string,
                  toolCallId: tc.toolCallId as string,
                  args: tc.input ?? tc.args,
                });
              }
              for (const tr of toolResults) {
                await onToolEvent({
                  type: 'tool-result',
                  name: tr.toolName as string,
                  toolCallId: tr.toolCallId as string,
                  result: tr.output ?? tr.result,
                });
              }
            },
          }
        : {}),
    });

    return { stream, abortController: controller };
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

  // Force answer: if loop ended on tool-only steps, force a text response
  const forceDetector = new ForceAnswerDetector();
  for (const step of result.steps ?? []) {
    forceDetector.recordStep({ text: step.text, toolCalls: step.toolCalls });
  }

  let reply: string;
  if (forceDetector.count >= FORCE_ANSWER_ROUNDS) {
    console.info("[ForceAnswer] model stuck in tool loop, forcing text response");
    const forced = await generateText({
      model: getModelGateway().getModel(selectedModel),
      system: systemMessage,
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: "" },
        { role: "user", content: FORCE_ANSWER_MSG },
      ],
    });
    reply = guardEmptyResponse(forced as { text: string; reasoning?: string | { text: string }[] });
  } else {
    reply = guardEmptyResponse(result as { text: string; reasoning?: string | { text: string }[] });
  }

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
    reply,
    toolCalls: toolCallsLog,
  };
}
