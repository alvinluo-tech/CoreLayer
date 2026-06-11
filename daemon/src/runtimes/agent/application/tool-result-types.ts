/**
 * Shared types for tool result warning injection.
 * Used by iteration-budget.ts and loop-breaker.ts.
 */
export interface ToolResultEntry {
  toolName?: string;
  toolCallId?: string;
  output?: unknown;
  result?: unknown;
  [key: string]: unknown;
}

/**
 * Inject a warning message into the tool results of a step event.
 * Returns a new array with the warning prepended to the first tool result.
 */
export function injectWarning(toolResults: ToolResultEntry[], warningMsg: string): ToolResultEntry[] {
  if (toolResults.length === 0) return toolResults;
  const first = toolResults[0]!;
  const warnedResult: ToolResultEntry = "output" in first
    ? { ...first, output: `${warningMsg}\n\n${String(first.output ?? "")}` }
    : { ...first, result: `${warningMsg}\n\n${String(first.result ?? "")}` };
  return [warnedResult, ...toolResults.slice(1)];
}
