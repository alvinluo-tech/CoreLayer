import type { ModelMessage } from "ai";
import type { MessageRow, MemoryRow } from "../../../persistence/repository.js";

// ---- Token Estimation ----

/**
 * Estimate token count for a text string.
 * Uses a heuristic tuned for mixed CJK + English content.
 * Odysseus uses (chars * 0.3) + (4 * msgs) which is English-biased.
 * We use a slightly higher ratio to account for CJK characters.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // CJK characters typically map to 1-2 tokens each.
  // English words average ~1.3 tokens.
  // A ratio of 0.45 works well for mixed CJK/English content.
  return Math.ceil(text.length * 0.45) + 2;
}

/**
 * Estimate tokens for a structured message array.
 */
export function estimateMessagesTokens(messages: ModelMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    // Role overhead per message
    total += 4;
    if (typeof msg.content === "string") {
      total += estimateTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "text") {
          total += estimateTokens(part.text);
        } else {
          // Non-text parts (images, tool-use) are estimated conservatively
          total += 10;
        }
      }
    }
  }
  return total;
}

// ---- Context Window Detection ----

/** Default context window when model is unknown */
const DEFAULT_CONTEXT_WINDOW = 128_000;

/** Known context windows by model name substring (longest match wins) */
const KNOWN_WINDOWS: [string, number][] = [
  ["gpt-4o-mini", 128_000],
  ["gpt-4o", 128_000],
  ["gpt-4-turbo", 128_000],
  ["gpt-4", 8_192],
  ["gpt-3.5-turbo", 16_385],
  ["o1-preview", 128_000],
  ["o1-mini", 128_000],
  ["o1", 200_000],
  ["o3-mini", 200_000],
  ["o3", 200_000],
  ["o4-mini", 200_000],
  ["claude-3-opus", 200_000],
  ["claude-3-sonnet", 200_000],
  ["claude-3-haiku", 200_000],
  ["claude-3.5-sonnet", 200_000],
  ["claude-sonnet-4", 200_000],
  ["claude-opus-4", 200_000],
  ["claude-haiku-4", 200_000],
  ["deepseek-chat", 64_000],
  ["deepseek-reasoner", 64_000],
  ["gemini-1.5-pro", 2_097_152],
  ["gemini-1.5-flash", 1_048_576],
  ["gemini-2.0", 1_048_576],
  ["gemini-2.5", 1_048_576],
  ["mistral-large", 128_000],
  ["mixtral", 32_768],
  ["llama-3", 128_000],
  ["llama-4", 1_048_576],
  ["qwen-2.5", 131_072],
  ["qwen-3", 131_072],
  ["mimo", 131_072],
];

/**
 * Resolve the context window size for a model.
 * Uses longest-substring matching against known model names.
 */
export function getContextWindow(modelName: string): number {
  const lower = modelName.toLowerCase();
  let best: [string, number] | null = null;

  for (const entry of KNOWN_WINDOWS) {
    if (lower.includes(entry[0])) {
      if (!best || entry[0].length > best[0].length) {
        best = entry;
      }
    }
  }

  return best ? best[1] : DEFAULT_CONTEXT_WINDOW;
}

// ---- Context Budget ----

export interface ContextBudget {
  /** Total context window of the model */
  contextWindow: number;
  /** Maximum input tokens (contextWindow * headroom factor) */
  maxInputTokens: number;
  /** Estimated tokens for the system prompt */
  systemPromptTokens: number;
  /** Estimated tokens for injected memories */
  memoryTokens: number;
  /** Remaining budget for conversation history */
  historyTokens: number;
}

/** Headroom factor — leave space for model's response */
const HEADROOM_FACTOR = 0.85;
/** Cap max input to avoid excessive cost */
const MAX_INPUT_CAP = 200_000;

/**
 * Compute the context budget for a conversation turn.
 *
 * Allocates token budget across: system prompt, memories, and history.
 * History gets the remaining budget after system prompt and memories.
 */
export function computeContextBudget(
  modelName: string,
  systemPromptTokens: number,
  memoryTokens: number,
): ContextBudget {
  const contextWindow = getContextWindow(modelName);
  const maxInputTokens = Math.min(
    Math.floor(contextWindow * HEADROOM_FACTOR),
    MAX_INPUT_CAP,
  );

  const historyTokens = Math.max(0, maxInputTokens - systemPromptTokens - memoryTokens);

  return {
    contextWindow,
    maxInputTokens,
    systemPromptTokens,
    memoryTokens,
    historyTokens,
  };
}

// ---- Compression Thresholds ----

/** Soft threshold — trigger compression proactively (closer to Odysseus's single 85% threshold) */
const COMPRESS_SOFT_THRESHOLD = 0.8;
/** Hard threshold — safety net to prevent API failures */
const COMPRESS_HARD_THRESHOLD = 0.85;
/** Minimum messages before compression is worthwhile */
const MIN_MESSAGES_FOR_COMPRESSION = 6;

/**
 * Determine whether compression should be triggered.
 *
 * Uses a dual-layer approach (inspired by Hermes):
 * - Soft trigger at 50% for smooth user experience
 * - Hard trigger at 85% as safety net
 *
 * Returns { shouldCompress, urgency } where urgency indicates
 * whether this is a soft or hard trigger.
 */
export function shouldCompress(
  historyTokens: number,
  budget: ContextBudget,
  messageCount: number,
): { shouldCompress: boolean; urgency: "soft" | "hard" | "none" } {
  if (messageCount < MIN_MESSAGES_FOR_COMPRESSION) {
    return { shouldCompress: false, urgency: "none" };
  }

  const ratio = historyTokens / budget.historyTokens;

  if (ratio >= COMPRESS_HARD_THRESHOLD) {
    return { shouldCompress: true, urgency: "hard" };
  }

  if (ratio >= COMPRESS_SOFT_THRESHOLD) {
    return { shouldCompress: true, urgency: "soft" };
  }

  return { shouldCompress: false, urgency: "none" };
}

// ---- History Selection ----

/** Number of recent messages to always preserve */
const PROTECT_RECENT_COUNT = 6;

/**
 * Select messages that fit within the token budget.
 * Always preserves the most recent N messages and truncates from the oldest.
 *
 * Returns the selected messages and whether truncation occurred.
 */
export function selectHistoryWithinBudget(
  messages: MessageRow[],
  budget: ContextBudget,
): { selected: MessageRow[]; truncated: boolean; estimatedTokens: number } {
  if (messages.length === 0) {
    return { selected: [], truncated: false, estimatedTokens: 0 };
  }

  // Always include the most recent messages
  const protectedMessages = messages.slice(-PROTECT_RECENT_COUNT);
  const candidateMessages = messages.slice(0, -PROTECT_RECENT_COUNT);

  // Estimate tokens for protected messages
  let protectedTokens = 0;
  for (const msg of protectedMessages) {
    protectedTokens += 4 + estimateTokens(msg.content);
    if (msg.toolCalls) {
      protectedTokens += estimateTokens(msg.toolCalls);
    }
  }

  // If protected messages alone exceed budget, truncate within protected
  if (protectedTokens > budget.historyTokens) {
    const truncated = messages.slice(-3); // Keep at least last 3
    let tokens = 0;
    for (const msg of truncated) {
      tokens += 4 + estimateTokens(msg.content);
      if (msg.toolCalls) {
        tokens += estimateTokens(msg.toolCalls);
      }
    }
    return { selected: truncated, truncated: true, estimatedTokens: tokens };
  }

  // Add older messages from newest to oldest until budget is exceeded
  const remainingBudget = budget.historyTokens - protectedTokens;
  let usedTokens = 0;
  const selectedOlder: MessageRow[] = [];

  for (let i = candidateMessages.length - 1; i >= 0; i--) {
    const msg = candidateMessages[i];
    const msgTokens = 4 + estimateTokens(msg.content) +
      (msg.toolCalls ? estimateTokens(msg.toolCalls) : 0);

    if (usedTokens + msgTokens > remainingBudget) break;

    selectedOlder.unshift(msg);
    usedTokens += msgTokens;
  }

  const selected = [...selectedOlder, ...protectedMessages];
  const totalTokens = protectedTokens + usedTokens;
  const truncated = selectedOlder.length < candidateMessages.length;

  return { selected, truncated, estimatedTokens: totalTokens };
}

// ---- Context Assembly Result ----

export interface AssembledContext {
  /** Messages to send to the model (system + history) */
  messages: ModelMessage[];
  /** Whether history was truncated */
  historyTruncated: boolean;
  /** Whether compression is recommended */
  shouldCompress: boolean;
  /** Compression urgency */
  compressionUrgency: "soft" | "hard" | "none";
  /** Token usage breakdown */
  tokens: {
    system: number;
    memory: number;
    history: number;
    total: number;
    budget: number;
  };
}

/**
 * Assemble the full context for a conversation turn.
 *
 * This is the main entry point that replaces the naive `slice(-20)` approach.
 * It:
 * 1. Computes the context budget for the current model
 * 2. Selects history messages within the token budget
 * 3. Checks if compression should be triggered
 * 4. Returns the assembled context with metadata
 */
export function assembleContext(
  modelName: string,
  systemPrompt: string,
  memories: MemoryRow[],
  history: MessageRow[],
): AssembledContext {
  const systemPromptTokens = estimateTokens(systemPrompt);

  // Build memory text and estimate tokens
  const memoryText = memories.map((m) => `${m.key}: ${m.value}`).join("\n");
  const memoryTokens = estimateTokens(memoryText);

  const budget = computeContextBudget(modelName, systemPromptTokens, memoryTokens);
  // Filter out compressed messages — they've been summarized into a summary message
  const uncompressedHistory = history.filter((m) => !m.compressed);
  const { selected, truncated, estimatedTokens: historyTokens } =
    selectHistoryWithinBudget(uncompressedHistory, budget);

  const { shouldCompress: needsCompress, urgency } = shouldCompress(
    historyTokens,
    budget,
    selected.length,
  );

  // Build the message array for the model
  const messages: ModelMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // Add memories as context if present
  if (memoryText) {
    messages.push({
      role: "system",
      content: `## 用户记忆\n${memoryText}`,
    });
  }

  // Add conversation history (filter out tool/system messages for type safety)
  for (const msg of selected) {
    if (msg.role === "user" || msg.role === "assistant") {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  return {
    messages,
    historyTruncated: truncated,
    shouldCompress: needsCompress,
    compressionUrgency: urgency,
    tokens: {
      system: systemPromptTokens,
      memory: memoryTokens,
      history: historyTokens,
      total: systemPromptTokens + memoryTokens + historyTokens,
      budget: budget.maxInputTokens,
    },
  };
}
