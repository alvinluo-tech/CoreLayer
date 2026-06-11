/**
 * Loop breaker for the agent loop.
 * Detects stuck loops (same tool + similar args) and excessive single-tool usage.
 * Inspired by Odysseus loop-breaker.
 */

import type { ToolResultEntry } from "./tool-result-types.js";
import { injectWarning } from "./tool-result-types.js";

const LOOP_BREAKER_MSG =
  "[系统提示] 检测到工具调用循环。请停止调用工具，基于已有信息直接回答用户问题。";

/** Same tool + similar args this many times -> stuck in a loop */
const STUCK_THRESHOLD = 3;
/** Single tool called this many times total -> excessive usage */
const EXCESSIVE_THRESHOLD = 10;

interface ToolCallRecord {
  callCount: number;
  lastArgs: string;
  consecutiveSimilar: number;
}

/**
 * Detects tool-loop pathologies:
 * 1. Same tool called repeatedly with similar args (stuck)
 * 2. Single tool called excessively many times
 */
export class LoopBreaker {
  private tools = new Map<string, ToolCallRecord>();

  /**
   * Record a tool call. Returns { stuck, excessive } flags.
   */
  recordToolCall(toolName: string, args: unknown): { stuck: boolean; excessive: boolean } {
    const argsStr = JSON.stringify(args ?? {});
    const existing = this.tools.get(toolName);

    if (existing) {
      existing.callCount++;
      const isSimilar = existing.lastArgs === argsStr;
      existing.consecutiveSimilar = isSimilar ? existing.consecutiveSimilar + 1 : 0;
      existing.lastArgs = argsStr;
    } else {
      this.tools.set(toolName, {
        callCount: 1,
        lastArgs: argsStr,
        consecutiveSimilar: 0,
      });
    }

    const record = this.tools.get(toolName)!;
    return {
      stuck: record.consecutiveSimilar >= STUCK_THRESHOLD,
      excessive: record.callCount >= EXCESSIVE_THRESHOLD,
    };
  }

  /** Reset all tracking state (call at start of new turn) */
  reset(): void {
    this.tools.clear();
  }
}

/**
 * Inject a loop breaker warning into the tool results of a step event.
 */
export function injectLoopBreakerWarning(toolResults: ToolResultEntry[]): ToolResultEntry[] {
  return injectWarning(toolResults, LOOP_BREAKER_MSG);
}
