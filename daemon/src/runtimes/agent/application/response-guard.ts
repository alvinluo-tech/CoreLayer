/**
 * Response guard utilities for the agent loop.
 * Handles edge cases like empty responses with reasoning content.
 */

/**
 * If the model returns empty text but has reasoning content (thinking models),
 * fall back to reasoning as the response text.
 * Returns the original result if text is non-empty.
 */
export function guardEmptyResponse(result: { text: string; reasoning?: string | { text: string }[] }): string {
  if (result.text && result.text.trim().length > 0) return result.text;

  const reasoning = result.reasoning;
  if (!reasoning) return result.text;

  if (typeof reasoning === "string" && reasoning.trim().length > 0) return reasoning;
  if (Array.isArray(reasoning)) {
    const combined = reasoning.map((r) => r.text).filter(Boolean).join("\n");
    if (combined.trim().length > 0) return combined;
  }

  return result.text;
}
