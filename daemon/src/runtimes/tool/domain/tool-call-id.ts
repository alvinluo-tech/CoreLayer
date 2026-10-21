/**
 * Deterministic tool call ID generator.
 *
 * When the AI SDK provides a real toolCallId, use it directly.
 * When it doesn't (e.g., in wrapped execute functions), generate
 * a deterministic ID from runId + toolId + normalized args.
 *
 * This ensures idempotency: the same tool call in the same run
 * always produces the same ID, preventing duplicate approval requests.
 */

import { createHash } from "crypto";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The run a tool call belongs to.
 *
 * The AI SDK invokes a tool's `execute` with only its arguments, so a tool that
 * needs to know *who is calling* — delegating work, attributing an effect —
 * cannot receive it as a parameter without trusting the model to supply it.
 * The agent loop establishes this context around the turn instead.
 */
const toolInvocationContext = new AsyncLocalStorage<{ runId?: string }>();

/** Run `fn` with `runId` as the current tool-invocation context. */
export function withToolInvocationContext<T>(runId: string | undefined, fn: () => T): T {
  return toolInvocationContext.run({ runId }, fn);
}

/** The run that owns the current tool call, if one was established. */
export function currentRunId(): string | undefined {
  return toolInvocationContext.getStore()?.runId;
}

/**
 * Normalize args for deterministic hashing.
 * Sorts object keys, handles nested objects recursively.
 */
function normalizeArgs(args: unknown): string {
  if (args === null || args === undefined) return "";
  if (typeof args !== "object") return JSON.stringify(args);
  if (Array.isArray(args)) {
    return `[${args.map(normalizeArgs).join(",")}]`;
  }
  const obj = args as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map((k) => `${k}:${normalizeArgs(obj[k])}`);
  return `{${pairs.join(",")}}`;
}

/**
 * Generate a deterministic tool call ID.
 *
 * @param runId - The AgentRun ID
 * @param toolId - The tool identifier
 * @param args - The tool call arguments
 * @returns A stable "tc_" prefixed ID that can be used for idempotency
 */
export function generateToolCallId(
  runId: string,
  toolId: string,
  args: unknown,
): string {
  const normalized = normalizeArgs(args);
  const input = `${runId}:${toolId}:${normalized}`;
  const hash = createHash("sha256").update(input).digest("hex").slice(0, 16);
  return `tc_${hash}`;
}

/**
 * Resolve the tool call ID for an AI tool call.
 * Uses the provided SDK toolCallId if available, otherwise generates one.
 *
 * @param sdkToolCallId - The toolCallId from the AI SDK (may be undefined)
 * @param runId - The AgentRun ID (needed for fallback generation)
 * @param toolId - The tool identifier
 * @param args - The tool call arguments
 * @returns A stable tool call ID
 */
export function resolveToolCallId(
  sdkToolCallId: string | undefined,
  runId: string | undefined,
  toolId: string,
  args: unknown,
): string | undefined {
  if (sdkToolCallId) return sdkToolCallId;
  if (!runId) return undefined;
  return generateToolCallId(runId, toolId, args);
}
