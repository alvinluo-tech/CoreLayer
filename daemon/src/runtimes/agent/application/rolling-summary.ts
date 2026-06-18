/**
 * Rolling Summary Memory — auto-summarize every N conversation turns.
 *
 * Inspired by OpenHanako's SessionSummaryManager. Tracks turn count and
 * generates a rolling summary when the threshold is reached. The summary
 * is stored as a memory (type "summary") and injected into context via
 * the existing buildSummarySection in context-builder.ts.
 */

import type { MemoryRow } from "../../../persistence/repository/memory.js";
import { getRepositories } from "../../../persistence/factory.js";
import { estimateTokens } from "./context-manager.js";

export interface RollingSummaryConfig {
  /** Number of turns between summaries (default: 10) */
  turnInterval: number;
  /** Maximum tokens for the summary (default: 1500) */
  maxSummaryTokens: number;
  /** Number of recent turns to include in summary generation (default: 20) */
  recentTurnsWindow: number;
}

const DEFAULT_CONFIG: RollingSummaryConfig = {
  turnInterval: 10,
  maxSummaryTokens: 1500,
  recentTurnsWindow: 20,
};

/**
 * Check if a rolling summary should be generated for this conversation.
 * Returns true if the conversation has reached the turn interval threshold.
 */
export async function shouldGenerateSummary(
  conversationId: string,
  config: Partial<RollingSummaryConfig> = {},
): Promise<boolean> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const repos = getRepositories();

  // Count user messages in this conversation
  const messages = await repos.conversations.getMessages(conversationId);
  const userTurnCount = messages.filter((m: { role: string }) => m.role === "user").length;

  // Check if we have an existing summary
  const existingSummary = await repos.memories.getByType("summary", "default");
  const conversationSummary = existingSummary.find(
    (m: MemoryRow) => m.scopeType === "conversation" && m.scopeId === conversationId,
  );

  if (!conversationSummary) {
    // No summary yet — generate after first interval
    return userTurnCount >= cfg.turnInterval;
  }

  // Count turns since last summary
  const lastSummaryTime = new Date(conversationSummary.updatedAt).getTime();
  const turnsSinceSummary = messages.filter(
    (m: { role: string; createdAt: string }) => m.role === "user" && new Date(m.createdAt).getTime() > lastSummaryTime,
  ).length;

  return turnsSinceSummary >= cfg.turnInterval;
}

/**
 * Generate a rolling summary for a conversation.
 *
 * Takes recent messages, generates a concise summary, and stores it
 * as a memory record. The summary replaces any previous summary for
 * this conversation (rolling window).
 */
export async function generateRollingSummary(
  conversationId: string,
  config: Partial<RollingSummaryConfig> = {},
): Promise<string | null> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const repos = getRepositories();

  // Get recent messages for summary generation
  const allMessages = await repos.conversations.getMessages(conversationId);
  const recentMessages = allMessages.slice(-cfg.recentTurnsWindow * 2); // *2 for user+assistant pairs

  if (recentMessages.length < 4) {
    return null; // Not enough messages to summarize
  }

  // Build summary prompt context
  const conversationText = recentMessages
    .map((m: { role: string; content: string }) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  // Generate summary using the LLM (via generateText)
  const summary = await callSummarizeLLM(conversationText);

  if (!summary) return null;

  // Truncate if over budget
  let finalSummary = summary;
  if (estimateTokens(summary) > cfg.maxSummaryTokens) {
    finalSummary = summary.slice(0, cfg.maxSummaryTokens * 3); // rough char estimate
  }

  // Store as memory (upsert replaces existing summary for this conversation)
  await repos.memories.upsert({
    userId: "default",
    scopeType: "conversation",
    scopeId: conversationId,
    type: "summary",
    tier: "context",
    key: `conversation_summary_${conversationId}`,
    value: finalSummary,
    source: "rolling_summary",
    confidence: 0.8,
  });

  return finalSummary;
}

/**
 * Get the current rolling summary for a conversation.
 * Returns null if no summary exists.
 */
export async function getRollingSummary(
  conversationId: string,
): Promise<string | null> {
  const repos = getRepositories();
  const summaries = await repos.memories.getByType("summary", "default");
  const conversationSummary = summaries.find(
    (m: MemoryRow) => m.scopeType === "conversation" && m.scopeId === conversationId,
  );
  return conversationSummary?.value ?? null;
}

/**
 * Call LLM to generate a summary. Uses a lightweight model for cost efficiency.
 */
async function callSummarizeLLM(conversationText: string): Promise<string | null> {
  try {
    const { generateText } = await import("ai");
    const { getModel } = await import("../../../gateways/ai-provider/provider.js");

    const result = await generateText({
      model: getModel(),
      prompt: `请将以下对话总结为简洁的中文摘要，保留关键信息、用户意图和重要决策。摘要应该在200字以内。

对话内容：
${conversationText}

请输出摘要：`,
      maxOutputTokens: 500,
    });

    return result.text || null;
  } catch (err) {
    console.error("[RollingSummary] LLM summary generation failed:", err);
    return null;
  }
}
