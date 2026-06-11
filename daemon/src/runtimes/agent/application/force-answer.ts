/**
 * Force answer detector for the agent loop.
 * Tracks consecutive tool-only rounds and triggers a forced text response.
 */

/** Number of consecutive tool-only rounds before force answer triggers */
export const FORCE_ANSWER_ROUNDS = 3;

export const FORCE_ANSWER_MSG =
  "[系统提示] 你已连续调用工具3轮未生成文本。请基于已获取的信息直接回答用户问题，不要再调用工具。";

/**
 * Tracks consecutive tool-only rounds in the agent loop.
 * When the model calls tools for 3+ rounds without generating any text,
 * the loop should stop and force a text-only follow-up call.
 */
export class ForceAnswerDetector {
  private consecutiveToolOnly = 0;

  /**
   * Record a completed step. Returns true if force answer should trigger.
   */
  recordStep(step: { text?: string; toolCalls?: unknown[] }): boolean {
    const hasToolCalls = (step.toolCalls?.length ?? 0) > 0;
    const hasText = (step.text?.trim().length ?? 0) > 0;

    if (hasToolCalls && !hasText) {
      this.consecutiveToolOnly++;
    } else {
      this.consecutiveToolOnly = 0;
    }

    return this.consecutiveToolOnly >= FORCE_ANSWER_ROUNDS;
  }

  get count(): number {
    return this.consecutiveToolOnly;
  }

  reset(): void {
    this.consecutiveToolOnly = 0;
  }
}
