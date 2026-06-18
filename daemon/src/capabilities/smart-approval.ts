/**
 * Smart Tool Approval — LLM-assessed risk evaluation for tool calls.
 *
 * Inspired by Hermes Agent's "smart" approval mode. Instead of relying
 * solely on static risk levels, the LLM evaluates each tool call in context
 * to determine whether it should be auto-approved, require confirmation,
 * or be denied.
 *
 * Three approval modes:
 * - "manual": Always require user confirmation (existing behavior)
 * - "auto": Use permission memories + static risk levels (existing behavior)
 * - "smart": LLM evaluates risk based on tool + args + context
 */

export type ApprovalMode = "manual" | "auto" | "smart";

export interface SmartApprovalResult {
  decision: "auto" | "confirm" | "deny";
  reason: string;
  confidence: number;
}

export interface SmartApprovalContext {
  toolName: string;
  toolDescription: string;
  toolRisk: string;
  args: unknown;
  conversationSummary?: string;
  userGoal?: string;
}

/**
 * Evaluate a tool call using LLM-based risk assessment.
 *
 * Sends the tool details and context to a lightweight LLM that returns
 * a risk assessment decision. This is used in "smart" approval mode.
 */
export async function evaluateToolRisk(
  context: SmartApprovalContext,
): Promise<SmartApprovalResult> {
  try {
    const { generateText } = await import("ai");
    const { getModel } = await import("../gateways/ai-provider/provider.js");

    const prompt = buildEvaluationPrompt(context);

    const result = await generateText({
      model: getModel(),
      prompt,
      maxOutputTokens: 200,
    });

    return parseEvaluationResult(result.text);
  } catch (err) {
    console.error("[SmartApproval] LLM evaluation failed, falling back to confirm:", err);
    // Fail safe: require confirmation on LLM failure
    return {
      decision: "confirm",
      reason: "LLM evaluation unavailable, defaulting to manual confirmation",
      confidence: 0,
    };
  }
}

/**
 * Build the evaluation prompt for the LLM.
 */
function buildEvaluationPrompt(context: SmartApprovalContext): string {
  const argsStr = JSON.stringify(context.args, null, 2);

  return `You are a security-conscious tool approval assistant. Evaluate whether this tool call is safe to auto-approve.

Tool: ${context.toolName}
Description: ${context.toolDescription}
Base Risk Level: ${context.toolRisk}
Arguments: ${argsStr}

${context.conversationSummary ? `Conversation context: ${context.conversationSummary}` : ""}
${context.userGoal ? `User's goal: ${context.userGoal}` : ""}

Consider:
1. Is this a read-only operation? (safer)
2. Does it modify files, databases, or external state? (riskier)
3. Is the scope limited and reversible?
4. Does it match what the user is trying to accomplish?
5. Could it cause data loss or security issues?

Respond in exactly this format (no other text):
DECISION: [auto|confirm|deny]
REASON: [one sentence explanation]
CONFIDENCE: [0.0-1.0]`;
}

/**
 * Parse the LLM evaluation result into a structured decision.
 */
function parseEvaluationResult(text: string): SmartApprovalResult {
  const lines = text.trim().split("\n");
  let decision: "auto" | "confirm" | "deny" = "confirm";
  let reason = "Unable to parse evaluation";
  let confidence = 0.5;

  for (const line of lines) {
    if (line.startsWith("DECISION:")) {
      const value = line.split(":")[1]?.trim().toLowerCase();
      if (value === "auto" || value === "confirm" || value === "deny") {
        decision = value;
      }
    } else if (line.startsWith("REASON:")) {
      reason = line.split(":").slice(1).join(":").trim();
    } else if (line.startsWith("CONFIDENCE:")) {
      const num = parseFloat(line.split(":")[1]?.trim() ?? "0.5");
      if (!isNaN(num)) confidence = Math.max(0, Math.min(1, num));
    }
  }

  return { decision, reason, confidence };
}

/**
 * Check if smart approval mode is enabled for the given context.
 */
export function isSmartApprovalMode(mode?: string): boolean {
  return mode === "smart";
}
