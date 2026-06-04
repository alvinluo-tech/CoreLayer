import { generateText } from "ai";
import type { ModelMessage } from "ai";
import { getModel } from "../ai/provider.js";
import type { MessageRow, MemoryRepository, UpsertMemoryInput } from "../db/repository.js";
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

const PREFERENCE_EXTRACTION_PROMPT = `从以下对话摘要中提取用户偏好、习惯、工作方式。以JSON格式输出一个数组，每个元素包含 "key"（偏好名称，简短）和 "value"（偏好描述，一句话）。

只提取明确表达的偏好，不要猜测。如果没有发现任何偏好，返回空数组 []。

示例输出：
[
  { "key": "coding_style", "value": "用户喜欢函数式编程风格" },
  { "key": "work_time", "value": "用户习惯在晚上写代码" }
]`;

/**
 * Run a second LLM pass to extract user preferences from the compressed summary.
 */
export async function extractPreferences(
  summary: string,
): Promise<ExtractedPreference[]> {
  if (!summary) return [];

  try {
    const result = await generateText({
      model: getModel(),
      messages: [
        { role: "system", content: PREFERENCE_EXTRACTION_PROMPT },
        { role: "user", content: summary },
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

// ---- Compression Logic ----

/**
 * Protect the last N messages from compression.
 * These are kept intact for immediate conversation continuity.
 */
const PROTECT_RECENT_COUNT = 10;

/**
 * Minimum messages required before compression makes sense.
 */
const MIN_MESSAGES = 6;

/**
 * Maximum tokens for the generated summary.
 */
const MAX_SUMMARY_TOKENS = 1024;

// ---- Pre-compression Memory Snapshot (Hermes pattern) ----

const MEMORY_SNAPSHOT_PROMPT = `从以下对话中提取关键信息，以便在压缩后保留重要上下文。以JSON格式输出，包含以下字段：

{
  "preferences": [{"key": "偏好名称", "value": "偏好描述"}],
  "decisions": [{"key": "决策名称", "value": "决策内容"}],
  "pendingTasks": [{"key": "任务名称", "value": "任务描述"}]
}

规则：
- 只提取明确表达的信息，不要猜测
- 每个类别最多提取 5 条
- 如果没有发现相关信息，返回空数组
- key 要简短（10字以内），value 要具体`;

/**
 * Extract key information from conversation before compression.
 * Saves as memory snapshots to preserve important context.
 *
 * @param messages - Recent conversation messages to extract from
 * @param memoryRepo - Memory repository for saving snapshots
 * @param conversationId - For logging context
 */
export async function snapshotMemoriesBeforeCompression(
  messages: MessageRow[],
  memoryRepo: MemoryRepository,
  conversationId?: string,
): Promise<void> {
  if (messages.length === 0) return;

  try {
    // Format recent messages for extraction
    const recentMessages = messages.slice(-20); // Last 20 messages
    const formatted = recentMessages
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 500)}`)
      .join("\n\n");

    const result = await generateText({
      model: getModel(),
      messages: [
        { role: "system", content: MEMORY_SNAPSHOT_PROMPT },
        { role: "user", content: formatted },
      ],
      maxOutputTokens: 1024,
    });

    const text = result.text?.trim() ?? "";
    if (!text) return;

    // Parse JSON from LLM output
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const parsed = JSON.parse(jsonMatch[0]) as {
      preferences?: Array<{ key: string; value: string }>;
      decisions?: Array<{ key: string; value: string }>;
      pendingTasks?: Array<{ key: string; value: string }>;
    };

    // Save extracted information as memories
    const inputs: UpsertMemoryInput[] = [];

    if (parsed.preferences) {
      for (const pref of parsed.preferences.slice(0, 5)) {
        inputs.push({
          key: `pref:${pref.key}`,
          value: pref.value,
          type: "preference",
          source: `conversation:${conversationId ?? "unknown"}`,
          confidence: 0.8,
        });
      }
    }

    if (parsed.decisions) {
      for (const dec of parsed.decisions.slice(0, 5)) {
        inputs.push({
          key: `decision:${dec.key}`,
          value: dec.value,
          type: "context",
          source: `conversation:${conversationId ?? "unknown"}`,
          confidence: 0.8,
        });
      }
    }

    if (parsed.pendingTasks) {
      for (const task of parsed.pendingTasks.slice(0, 5)) {
        inputs.push({
          key: `pending:${task.key}`,
          value: task.value,
          type: "context",
          source: `conversation:${conversationId ?? "unknown"}`,
          confidence: 0.7,
        });
      }
    }

    // Upsert all extracted memories
    for (const input of inputs) {
      try {
        await memoryRepo.upsert(input);
      } catch {
        // Skip individual failures
      }
    }
  } catch (err) {
    logError("compressor/snapshot", err);
    // Don't fail compression if snapshot fails
  }
}

/**
 * Compress conversation history using LLM summarization.
 *
 * Inspired by Hermes (pre-compaction flush + structured summary)
 * and Odysseus (structured output format).
 *
 * Flow:
 * 0. Snapshot memories before compression (preserve important context)
 * 1. Split messages: older (to compress) + recent (to preserve)
 * 2. Sanitize tool messages in the older portion
 * 3. Format older messages for summarization
 * 4. Call LLM to generate structured summary
 * 5. Return summary + preserved messages
 *
 * @param messages - Full conversation history (not including system prompt)
 * @param conversationId - For logging context
 * @param memoryRepo - Memory repository for pre-compression snapshots
 * @returns CompactionResult with summary and preserved messages
 */
export async function compressConversation(
  messages: MessageRow[],
  _conversationId?: string,
  memoryRepo?: MemoryRepository,
): Promise<CompactionResult> {
  if (messages.length < MIN_MESSAGES) {
    return {
      summary: "",
      compressedMessages: [],
      preservedMessages: messages,
      extractedPreferences: [],
    };
  }

  // Step 0: Snapshot memories before compression (Hermes pattern)
  // This ensures important context is preserved even after compression
  if (memoryRepo) {
    await snapshotMemoriesBeforeCompression(messages, memoryRepo, _conversationId);
  }

  // Split: older messages to compress, recent to preserve
  const recentCount = Math.min(PROTECT_RECENT_COUNT, Math.floor(messages.length / 2));
  const olderMessages = messages.slice(0, messages.length - recentCount);
  const recentMessages = messages.slice(messages.length - recentCount);

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

    // Second LLM pass: extract user preferences from the summary
    const extractedPreferences = await extractPreferences(summary);

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
