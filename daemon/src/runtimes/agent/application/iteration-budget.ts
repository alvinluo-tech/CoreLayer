/**
 * Iteration budget tracking for the agent loop.
 * Injects a pressure warning when the loop reaches 80% of the configured budget.
 */

import type { ToolResultEntry } from "./tool-result-types.js";
import { injectWarning } from "./tool-result-types.js";

const BUDGET_WARNING_MSG = "[系统提示] 你已达到迭代次数上限，请整合已有信息并尽快结束回答。不要再调用工具。";

/**
 * Tracks agent loop step count and injects a pressure warning
 * when the loop reaches 80% of the configured budget.
 * The warning is injected exactly once into the next tool result.
 */
export class IterationBudget {
  private readonly threshold: number;
  private currentStep = 0;
  private warned = false;

  constructor(maxSteps: number) {
    this.threshold = Math.floor(maxSteps * 0.8);
  }

  /**
   * Record a completed step. Returns true if a warning should be injected.
   */
  advance(): boolean {
    this.currentStep++;
    if (!this.warned && this.currentStep >= this.threshold) {
      this.warned = true;
      return true;
    }
    return false;
  }

  get shouldWarn(): boolean {
    return this.warned && this.currentStep >= this.threshold;
  }

  get step(): number {
    return this.currentStep;
  }
}

/**
 * Inject a budget warning into the tool results of a step event.
 * Returns a new array with the warning prepended to the first tool result.
 */
export function injectBudgetWarning(toolResults: ToolResultEntry[]): ToolResultEntry[] {
  return injectWarning(toolResults, BUDGET_WARNING_MSG);
}
