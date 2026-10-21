/**
 * Adjudication Service — orchestrates adversarial LLM review on code attempt deliverables.
 *
 * It combines the task objective, git diff, modified file list, and test command output,
 * requests an adversarial evaluation from an auditing LLM, and parses the response into
 * a strongly-typed `AdjudicationVerdict`.
 */

import {
  buildAdversarialJudgePrompt,
  parseAdjudicationResponse,
  type AdjudicationInput,
  type AdjudicationVerdict,
} from "./adversarial-judge.js";

export interface AdjudicateAttemptInput extends AdjudicationInput {
  /** Optional identifier for the attempt being audited. */
  attemptId?: string;
}

export interface AdjudicationDeps {
  generateText: (options: {
    model: unknown;
    prompt: string;
    maxOutputTokens?: number;
  }) => Promise<{ text: string }>;
  getModel: () => unknown;
}

async function resolveDefaultDeps(): Promise<AdjudicationDeps> {
  const { generateText } = await import("ai");
  const { getModel } = await import("../../gateways/ai-provider/provider.js");
  return {
    generateText: generateText as never,
    getModel,
  };
}

/**
 * Conducts an adversarial adjudication review on a coding attempt's output.
 */
export async function adjudicateAttempt(
  input: AdjudicateAttemptInput,
  overrides?: Partial<AdjudicationDeps>,
): Promise<AdjudicationVerdict> {
  if (!input.taskObjective || input.taskObjective.trim().length === 0) {
    return {
      decision: "REJECT_WITH_FEEDBACK",
      confidence: 1.0,
      summary: "Adjudication failed: Missing task objective",
      critique: "The attempt has no recorded task objective to audit against.",
      issues: [
        {
          severity: "critical",
          description: "Missing task objective",
        },
      ],
      testsIntegrityVerdict: "not_applicable",
    };
  }

  // Pre-check: If there are zero diff changes, reject immediately without wasting LLM tokens
  if (!input.gitDiff || input.gitDiff.trim().length === 0) {
    return {
      decision: "REJECT_WITH_FEEDBACK",
      confidence: 1.0,
      summary: "Adjudication failed: Empty git diff; no code modifications delivered",
      critique: "The executor reported success but left an empty git diff with no changed lines.",
      issues: [
        {
          severity: "critical",
          description: "Empty git diff — nothing was implemented or changed",
        },
      ],
      testsIntegrityVerdict: "not_applicable",
    };
  }

  const prompt = buildAdversarialJudgePrompt(input);

  try {
    const deps: AdjudicationDeps = {
      ...(await resolveDefaultDeps()),
      ...overrides,
    };

    const model = deps.getModel();
    const result = await deps.generateText({
      model,
      prompt,
      maxOutputTokens: 2000,
    });

    return parseAdjudicationResponse(result.text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      decision: "REJECT_WITH_FEEDBACK",
      confidence: 0.0,
      summary: `Adjudication service error: ${message}`,
      critique: `Failed to complete adversarial review due to LLM provider error: ${message}`,
      issues: [
        {
          severity: "critical",
          description: `LLM evaluation failure: ${message}`,
        },
      ],
      testsIntegrityVerdict: "suspicious",
    };
  }
}
