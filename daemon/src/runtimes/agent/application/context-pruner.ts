/**
 * Context Pruner — mid-turn dynamic message pruning for the agent loop.
 *
 * streamText's prepareStep hook calls pruneMessages before every LLM step so a
 * long tool chain inside a single turn cannot blow the context window: the
 * leading system block and the most recent messages survive, stale middle
 * messages are dropped, and the surviving window never begins with an orphaned
 * tool result (which would violate the message protocol).
 */

import type { ModelMessage } from "ai";

/** Hard cap on in-turn message count before pruning kicks in. */
export const MAX_TURN_CONTEXT_MESSAGES = 80;

/**
 * System notice injected once the step budget approaches its limit, urging the
 * model to synthesize and answer instead of spawning more tool steps.
 */
export const STEP_BUDGET_NOTICE =
  "[System Notice: Approaching maximum step budget. Please synthesize results and deliver your final answer directly.]";

/** Step number at which the budget notice starts being injected (80%). */
export function budgetWarnStep(maxSteps: number): number {
  return Math.max(1, Math.floor(maxSteps * 0.8));
}

export interface PruneResult {
  messages: ModelMessage[];
  prunedCount: number;
}

/**
 * Prune a message list down to at most `maxMessages` entries.
 *
 * - Always keeps the leading system message(s).
 * - Keeps the most recent messages to fill the remaining budget.
 * - Advances past leading tool messages in the kept window so a tool result is
 *   never separated from its assistant tool-call message.
 * - Returns the input array untouched when already within budget.
 */
export function pruneMessages(
  messages: ModelMessage[],
  maxMessages: number = MAX_TURN_CONTEXT_MESSAGES,
): PruneResult {
  if (messages.length <= maxMessages) {
    return { messages, prunedCount: 0 };
  }

  const head: ModelMessage[] = [];
  let index = 0;
  while (index < messages.length && messages[index].role === "system") {
    head.push(messages[index]);
    index += 1;
  }

  const tailBudget = Math.max(0, maxMessages - head.length);
  let tailStart = messages.length - tailBudget;
  if (tailStart < index) tailStart = index;
  // Never open the window with an orphaned tool result.
  while (tailStart < messages.length && messages[tailStart].role === "tool") {
    tailStart += 1;
  }

  const kept = [...head, ...messages.slice(tailStart)];
  return { messages: kept, prunedCount: messages.length - kept.length };
}
