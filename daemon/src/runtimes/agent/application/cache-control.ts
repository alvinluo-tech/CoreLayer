/**
 * Anthropic prompt caching helpers.
 * Applies cacheControl to system messages and tool definitions.
 */

import type { ModelMessage, Tool } from "ai";

export const CACHE_CONTROL = { type: "ephemeral" } as const;

/**
 * Apply cacheControl to the system message (first message) and the last tool.
 * Returns a new messages array and a new tools object — immutable.
 */
export function applyCacheControl(
  messages: ModelMessage[],
  tools: Record<string, Tool>,
): { messages: ModelMessage[]; tools: Record<string, Tool> } {
  const cachedMessages = messages.map((msg, i) =>
    i === 0 && msg.role === "system"
      ? { ...msg, providerOptions: { anthropic: { cacheControl: CACHE_CONTROL } } }
      : msg,
  );

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
