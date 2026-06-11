/**
 * Memory and summary fetching for the agent loop.
 * Retrieves relevant memories and conversation summaries for context injection.
 */

import { getRepositories } from "../../../persistence/factory.js";
import type { MessageRow, ScoredMemoryRow } from "../../../persistence/repository.js";
import { MEMORY_MIN_SCORE } from "./context-builder.js";

/**
 * Fetch relevant memories for context injection.
 * Uses scored search when a query is available for relevance-based retrieval.
 */
export async function fetchRelevantMemories(
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
export function extractSummaryFromHistory(history: MessageRow[]): string | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === "system" && msg.content.startsWith("[对话摘要")) {
      const idx = msg.content.indexOf("\n\n");
      return idx >= 0 ? msg.content.slice(idx + 2) : msg.content;
    }
  }
  return undefined;
}
