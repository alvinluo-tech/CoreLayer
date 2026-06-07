import { generateText } from "ai";
import type { ModelMessage } from "ai";
import { getModel } from "../gateways/ai-provider/provider.js";
import type { MessageRow } from "../persistence/repository.js";
import { logError } from "../utils/errors.js";

// ---- Summary Structure ----

export interface CompactionSummary {
  userGoal: string;
  whatWasDone: string;
  currentState: string;
  pendingNext: string;
  keyContext: string;
}

export interface ToolSummary {
  toolName: string;
  summary: string;
}

export interface ExtractedPreference {
  key: string;
  value: string;
}

export interface CompactionResult {
  /** The summary text (structured, < 1000 tokens) */
  summary: string;
  /** Messages that were summarized (removed from history) */
  compressedMessages: MessageRow[];
  /** Messages that were preserved (recent N) */
  preservedMessages: MessageRow[];
  /** User preferences extracted from the conversation */
  extractedPreferences: ExtractedPreference[];
}

// ---- Summary Prompt ----

const SUMMARY_SYSTEM_PROMPT = `You are a conversation summarizer. Your job is to compress older conversation history into a structured summary.

You MUST produce a summary in exactly this format (in Chinese, matching the user's language):

## 用户目标
[What the user is trying to accomplish]

## 已完成
[What has been done so far, key decisions made]

## 当前状态
[Where things stand right now, any pending items]

## 待办/下一步
[What needs to happen next]

## 关键上下文
[Important constraints, preferences, tool results, or details that must not be lost]

## 工具调用结果
[Structured summaries of tool calls — include tool name and key outcome]

Rules:
- Keep the total summary under 800 tokens
- Be specific, not vague — include tool names, file paths, concrete numbers
- Preserve user preferences and constraints
- Do NOT include filler conversation, greetings, or repeated confirmations
- Tool call results section must use the preserved tool summaries provided below
- Each tool call entry: \`- toolName: 关键结果（一句话）\``;

// ---- Tool Message Sanitization ----

/**
 * Sanitize tool messages after compression.
 *
 * Two-pass repair (from Odysseus):
 * 1. Remove orphaned `tool` role messages that lack a preceding `tool_calls` assistant message
 * 2. Strip `tool_calls` from assistant messages whose tool responses were all removed
 */
export function sanitizeToolMessages(messages: MessageRow[]): MessageRow[] {
  // Pass 1: Remove orphaned tool messages
  const toolCallIds = new Set<string>();
  for (const msg of messages) {
    if (msg.role === "assistant" && msg.toolCalls) {
      try {
        const calls = JSON.parse(msg.toolCalls) as { toolCallId?: string }[];
        for (const call of calls) {
          if (call.toolCallId) toolCallIds.add(call.toolCallId);
        }
      } catch {
        // Invalid JSON, skip
      }
    }
  }

  const withoutOrphans = messages.filter((msg) => {
    if (msg.role === "tool") {
      return msg.toolCallId ? toolCallIds.has(msg.toolCallId) : false;
    }
    return true;
  });

  // Pass 2: Strip tool_calls from assistant messages whose results were removed
  const remainingToolIds = new Set<string>();
  for (const msg of withoutOrphans) {
    if (msg.role === "tool" && msg.toolCallId) {
      remainingToolIds.add(msg.toolCallId);
    }
  }

  return withoutOrphans.map((msg) => {
    if (msg.role === "assistant" && msg.toolCalls) {
      try {
        const calls = JSON.parse(msg.toolCalls) as { toolCallId?: string }[];
        const validCalls = calls.filter(
          (c) => !c.toolCallId || remainingToolIds.has(c.toolCallId),
        );
        if (validCalls.length === 0) {
          return { ...msg, toolCalls: null };
        }
        if (validCalls.length < calls.length) {
          return { ...msg, toolCalls: JSON.stringify(validCalls) };
        }
      } catch {
        return { ...msg, toolCalls: null };
      }
    }
    return msg;
  });
}

// ---- Tool Result Summary Extraction ----

/** Max characters per tool summary output */
const TOOL_SUMMARY_MAX_CHARS = 200;

/**
 * Extract structured summaries from tool call/result pairs.
 *
 * Walks through messages to find assistant messages with tool_calls,
 * then pairs each call with its corresponding tool result message.
 * Returns tool name + key output (truncated to 200 chars each).
 */
export function extractToolSummaries(messages: MessageRow[]): ToolSummary[] {
  const summaries: ToolSummary[] = [];

  // Build a map of toolCallId -> tool result content
  const toolResults = new Map<string, string>();
  for (const msg of messages) {
    if (msg.role === "tool" && msg.toolCallId) {
      let content = msg.content;
      if (content.length > TOOL_SUMMARY_MAX_CHARS) {
        content = content.slice(0, TOOL_SUMMARY_MAX_CHARS) + "...";
      }
      toolResults.set(msg.toolCallId, content);
    }
  }

  // Find assistant messages with tool_calls and pair with results
  for (const msg of messages) {
    if (msg.role !== "assistant" || !msg.toolCalls) continue;

    try {
      const calls = JSON.parse(msg.toolCalls) as {
        toolCallId?: string;
        toolName?: string;
      }[];
      for (const call of calls) {
        if (!call.toolCallId || !call.toolName) continue;
        const result = toolResults.get(call.toolCallId) ?? "(no result)";
        summaries.push({
          toolName: call.toolName,
          summary: result,
        });
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  return summaries;
}

/**
 * Format tool summaries for inclusion in the compression prompt.
 */
function formatToolSummaries(summaries: ToolSummary[]): string {
  if (summaries.length === 0) return "";
  return summaries
    .map((s) => `- ${s.toolName}: ${s.summary}`)
    .join("\n");
}

// ---- Message Formatting ----

/** Max characters per message when formatting for summarization */
const MAX_MSG_CHARS = 2000;

/**
 * Format messages into a simple ROLE: text format for the summarizer.
 * Each message is truncated to MAX_MSG_CHARS to bound the summarizer input.
 */
function formatMessagesForSummary(messages: MessageRow[]): string {
  return messages
    .map((msg) => {
      const role = msg.role === "user" ? "User" :
                   msg.role === "assistant" ? "Assistant" :
                   msg.role === "system" ? "System" : "Tool";
      let content = msg.content;
      if (content.length > MAX_MSG_CHARS) {
        content = content.slice(0, MAX_MSG_CHARS) + "... [truncated]";
      }
      return `${role}: ${content}`;
    })
    .join("\n\n");
}

// ---- Preference Extraction ----

const PREFERENCE_EXTRACTION_PROMPT = `从以下对话历史中提取用户偏好、习惯、工作方式。以JSON格式输出一个数组，每个元素包含 "key"（偏好名称，简短）和 "value"（偏好描述，一句话）。

只提取明确表达的偏好，不要猜测。如果没有发现任何偏好，返回空数组 []。

示例输出：
[
  { "key": "coding_style", "value": "用户喜欢函数式编程风格" },
  { "key": "work_time", "value": "用户习惯在晚上写代码" }
]`;

/**
 * Extract user preferences from conversation messages.
 * Merged with the pre-compression memory snapshot to save one LLM call.
 */
export async function extractPreferences(
  messages: MessageRow[],
): Promise<ExtractedPreference[]> {
  if (messages.length === 0) return [];

  try {
    // Format messages for extraction (reuse same truncation as snapshot)
    const formatted = messages
      .slice(-20)
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 500)}`)
      .join("\n\n");

    const result = await generateText({
      model: getModel(),
      messages: [
        { role: "system", content: PREFERENCE_EXTRACTION_PROMPT },
        { role: "user", content: formatted },
      ],
      maxOutputTokens: 512,
    });

    const text = result.text?.trim() ?? "";
    if (!text || text === "[]") return [];

    // Parse JSON array from LLM output
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as unknown[];
    return parsed
      .filter(
        (item): item is ExtractedPreference =>
          typeof item === "object" &&
          item !== null &&
          "key" in item &&
          "value" in item &&
          typeof (item as Record<string, unknown>).key === "string" &&
          typeof (item as Record<string, unknown>).value === "string",
      )
      .slice(0, 10); // Cap at 10 preferences per extraction
  } catch {
    return [];
  }
}

// ---- Per-Turn Memory Extraction (BaiLongma Recognizer pattern) ----

export interface ExtractedMemory {
  key: string;
  value: string;
  type: "fact" | "preference" | "context";
}

const TURN_EXTRACTION_PROMPT = `从以下单轮对话（用户消息 + 助手回复）中提取值得长期记住的信息。

提取类型：
- fact: 客观事实（用户名字、地址、项目信息等）
- preference: 用户偏好（喜欢/不喜欢、习惯、风格等）
- context: 重要上下文（当前任务、进行中的工作等）

规则：
- 只提取明确表达的信息，不要猜测
- 每条记忆用一句话描述，key 简短（英文 snake_case）
- 如果没有值得记住的信息，返回空数组 []
- 最多提取 5 条

输出 JSON 数组格式：
[
  { "key": "user_name", "value": "用户叫张三", "type": "fact" },
  { "key": "coding_style", "value": "用户喜欢函数式编程", "type": "preference" }
]`;

/**
 * Extract memories from a single conversation turn (user + assistant).
 * Runs as fire-and-forget after each response is saved.
 */
export async function extractMemoriesFromTurn(
  userMessage: string,
  assistantMessage: string,
): Promise<ExtractedMemory[]> {
  if (!userMessage.trim() || !assistantMessage.trim()) return [];

  // Skip very short exchanges (greetings, confirmations)
  if (userMessage.length < 10 && assistantMessage.length < 50) return [];

  try {
    const formatted = `User: ${userMessage.slice(0, 1000)}\n\nAssistant: ${assistantMessage.slice(0, 1000)}`;

    const result = await generateText({
      model: getModel(),
      messages: [
        { role: "system", content: TURN_EXTRACTION_PROMPT },
        { role: "user", content: formatted },
      ],
      maxOutputTokens: 512,
    });

    const text = result.text?.trim() ?? "";
    if (!text || text === "[]") return [];

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as unknown[];
    return parsed
      .filter(
        (item): item is ExtractedMemory =>
          typeof item === "object" &&
          item !== null &&
          "key" in item &&
          "value" in item &&
          "type" in item &&
          typeof (item as Record<string, unknown>).key === "string" &&
          typeof (item as Record<string, unknown>).value === "string" &&
          ["fact", "preference", "context"].includes(
            (item as Record<string, unknown>).type as string,
          ),
      )
      .slice(0, 5);
  } catch {
    return [];
  }
}

// ---- Compression Logic ----

/**
 * Protect the last N messages from compression.
 * These are kept intact for immediate conversation continuity.
 */
const PROTECT_RECENT_COUNT = 6;

/**
 * Minimum messages required before compression makes sense.
 */
const MIN_MESSAGES = 6;

/**
 * Maximum tokens for the generated summary.
 */
const MAX_SUMMARY_TOKENS = 1024;

/**
 * Compress conversation history using LLM summarization.
 *
 * Inspired by Hermes (pre-compaction flush + structured summary)
 * and Odysseus (structured output format).
 *
 * Flow:
 * 1. Split messages: older (to compress) + recent (to preserve)
 * 2. Sanitize tool messages in the older portion
 * 3. Format older messages for summarization
 * 4. Call LLM to generate structured summary
 * 5. Extract user preferences from older messages (merged with snapshot)
 * 6. Return summary + preserved messages
 *
 * @param messages - Full conversation history (not including system prompt)
 * @param _conversationId - For logging context
 * @returns CompactionResult with summary and preserved messages
 */
export async function compressConversation(
  messages: MessageRow[],
  _conversationId?: string,
): Promise<CompactionResult> {
  // Filter out already-compressed messages and summary system messages (defense in depth)
  const activeMessages = messages.filter(
    (m) =>
      !m.compressed &&
      !(m.role === "system" && m.content.startsWith("[对话摘要")),
  );

  if (activeMessages.length < MIN_MESSAGES) {
    return {
      summary: "",
      compressedMessages: [],
      preservedMessages: messages,
      extractedPreferences: [],
    };
  }

  // Split: older messages to compress, recent to preserve
  const recentCount = Math.min(PROTECT_RECENT_COUNT, Math.floor(activeMessages.length / 2));
  const olderMessages = activeMessages.slice(0, activeMessages.length - recentCount);
  const recentMessages = activeMessages.slice(activeMessages.length - recentCount);

  // Sanitize tool messages in the older portion
  const sanitizedOlder = sanitizeToolMessages(olderMessages);

  // Filter out system messages from the summarization target
  const toSummarize = sanitizedOlder.filter((m) => m.role !== "system");

  if (toSummarize.length === 0) {
    return {
      summary: "",
      compressedMessages: [],
      preservedMessages: recentMessages,
      extractedPreferences: [],
    };
  }

  // Format for summarization
  const formattedHistory = formatMessagesForSummary(toSummarize);

  // Extract tool summaries for preserved context
  const toolSummaries = extractToolSummaries(sanitizedOlder);
  const toolSummaryText = formatToolSummaries(toolSummaries);

  // Build prompt with preserved tool context
  let userContent = `请将以下对话历史压缩为结构化摘要：\n\n${formattedHistory}`;
  if (toolSummaryText) {
    userContent += `\n\n## 已提取的工具调用摘要（请保留在摘要中）：\n${toolSummaryText}`;
  }

  // Call LLM for summarization
  const summaryPrompt: ModelMessage[] = [
    { role: "system", content: SUMMARY_SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];

  try {
    const result = await generateText({
      model: getModel(),
      messages: summaryPrompt,
      maxOutputTokens: MAX_SUMMARY_TOKENS,
    });

    const summary = result.text?.trim() ?? "";

    if (!summary) {
      // Fallback: if summarization produced no output, just trim
      return {
        summary: `[对话历史已压缩，共 ${olderMessages.length} 条消息]`,
        compressedMessages: olderMessages,
        preservedMessages: recentMessages,
        extractedPreferences: [],
      };
    }

    // Extract user preferences from older messages (merged with memory snapshot)
    const extractedPreferences = await extractPreferences(olderMessages);

    return {
      summary,
      compressedMessages: olderMessages,
      preservedMessages: recentMessages,
      extractedPreferences,
    };
  } catch (err) {
    // On failure, return a fallback summary and preserve all messages
    logError("compressor/summarize", err);

    return {
      summary: `[摘要生成失败，已保留完整历史。共 ${olderMessages.length} 条早期消息]`,
      compressedMessages: [],
      preservedMessages: messages,
      extractedPreferences: [],
    };
  }
}

/**
 * Create a summary message row that can be inserted into the conversation.
 * This message is marked as a system message with summary metadata.
 */
export function createSummaryMessage(
  _conversationId: string,
  summary: string,
  compressedCount: number,
): {
  role: "system";
  content: string;
  toolCalls?: string;
} {
  // conversationId reserved for future: linking summary to source messages
  return {
    role: "system",
    content: `[对话摘要 - 压缩了 ${compressedCount} 条消息]\n\n${summary}`,
  };
}
