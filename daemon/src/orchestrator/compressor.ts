import { generateText } from "ai";
import type { ModelMessage } from "ai";
import { getModel } from "../ai/provider.js";
import type { MessageRow } from "../db/repository.js";

// ---- Summary Structure ----

export interface CompactionSummary {
  userGoal: string;
  whatWasDone: string;
  currentState: string;
  pendingNext: string;
  keyContext: string;
}

export interface CompactionResult {
  /** The summary text (structured, < 1000 tokens) */
  summary: string;
  /** Messages that were summarized (removed from history) */
  compressedMessages: MessageRow[];
  /** Messages that were preserved (recent N) */
  preservedMessages: MessageRow[];
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

Rules:
- Keep the total summary under 800 tokens
- Be specific, not vague — include tool names, file paths, concrete numbers
- Preserve user preferences and constraints
- Do NOT include filler conversation, greetings, or repeated confirmations
- If there were tool calls, summarize their results, not the raw output`;

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
 * 5. Return summary + preserved messages
 *
 * @param messages - Full conversation history (not including system prompt)
 * @param conversationId - For logging context
 * @returns CompactionResult with summary and preserved messages
 */
export async function compressConversation(
  messages: MessageRow[],
  _conversationId?: string,
): Promise<CompactionResult> {
  if (messages.length < MIN_MESSAGES) {
    return {
      summary: "",
      compressedMessages: [],
      preservedMessages: messages,
    };
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
    };
  }

  // Format for summarization
  const formattedHistory = formatMessagesForSummary(toSummarize);

  // Call LLM for summarization
  const summaryPrompt: ModelMessage[] = [
    { role: "system", content: SUMMARY_SYSTEM_PROMPT },
    {
      role: "user",
      content: `请将以下对话历史压缩为结构化摘要：\n\n${formattedHistory}`,
    },
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
      };
    }

    return {
      summary,
      compressedMessages: olderMessages,
      preservedMessages: recentMessages,
    };
  } catch (err) {
    // On failure, return a fallback summary and preserve all messages
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Compressor] Summarization failed for conversation ${_conversationId}: ${errMsg}`);

    return {
      summary: `[摘要生成失败，已保留完整历史。共 ${olderMessages.length} 条早期消息]`,
      compressedMessages: [],
      preservedMessages: messages,
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
