/**
 * Model guard for external Claude Code execution.
 *
 * Claude Code may be pointed at a third-party Anthropic-compatible endpoint.
 * When it is, the model identifier must name a DeepSeek model: routing a
 * Claude label (`opus`, `sonnet`) to a DeepSeek proxy produces a model_not_found
 * error that reads like a credential failure, and silently falling back would
 * hide the misconfiguration behind an unrelated provider.
 *
 * The guard rejects rather than rewrites. A run that cannot prove it is using
 * an approved model must fail loudly before spawning.
 */

/** Model ids accepted for Claude Code execution. */
export const ALLOWED_CLAUDE_MODEL_PREFIXES = ["deepseek"] as const;

export type ClaudeModelVerdict =
  | { allowed: true; model: string }
  | { allowed: false; reason: string };

/**
 * Validate the model a Claude Code run will use.
 *
 * Accepts the raw model id, including dated and context-hinted spellings such
 * as `deepseek-v4.1-flash` or `deepseek-v4-pro[1m]`.
 */
export function validateClaudeModel(model: string | undefined): ClaudeModelVerdict {
  const trimmed = model?.trim();
  if (!trimmed) {
    return {
      allowed: false,
      reason:
        "Claude Code requires an explicit DeepSeek model. Set ANTHROPIC_MODEL (or the executor policy model) " +
        `to a model beginning with ${ALLOWED_CLAUDE_MODEL_PREFIXES.map((p) => `'${p}'`).join(" or ")}.`,
    };
  }

  // Strip an ACP/SDK context hint (`[1m]`) before matching the family name.
  const normalized = trimmed.replace(/\[[^\]]*\]$/, "").toLowerCase();
  const allowed = ALLOWED_CLAUDE_MODEL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  if (!allowed) {
    return {
      allowed: false,
      reason:
        `Claude Code is restricted to DeepSeek models; '${trimmed}' is not one. ` +
        `Set ANTHROPIC_MODEL to a model beginning with ${ALLOWED_CLAUDE_MODEL_PREFIXES.map((p) => `'${p}'`).join(" or ")}.`,
    };
  }

  return { allowed: true, model: trimmed };
}
