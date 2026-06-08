/**
 * Secret masking utilities for safe logging and event streams.
 *
 * Provides functions to mask sensitive values in strings and objects,
 * preventing API keys and tokens from leaking into logs or event streams.
 */

/** Regex patterns matching sensitive object key names. */
export const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /apiKey/i,
  /api_key/i,
  /token/i,
  /secret/i,
  /password/i,
  /authorization/i,
  /bearer/i,
];

/**
 * Mask a string value, showing first 4 and last 4 characters with
 * asterisks in between. If the string is 8 chars or fewer, it is
 * fully masked.
 *
 * @example
 * maskSecret("sk-1234567890abcdef") // "sk-1**************cdef"
 * maskSecret("short")               // "*****"
 */
export function maskSecret(value: string): string {
  if (value.length <= 8) {
    return "*".repeat(value.length);
  }
  const prefix = value.slice(0, 4);
  const suffix = value.slice(-4);
  const masked = "*".repeat(value.length - 8);
  return `${prefix}${masked}${suffix}`;
}

/**
 * Recursively walk an object and mask values whose keys match
 * sensitive patterns. Non-object primitives and arrays are returned
 * as-is (arrays have their elements walked).
 *
 * Returns a **new** object — the original is never mutated.
 */
export function maskObjectSecrets(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) =>
      pattern.test(key),
    );

    if (isSensitive && typeof value === "string") {
      result[key] = maskSecret(value);
    } else if (
      isSensitive &&
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      // Sensitive key pointing to an object — mask the whole object
      result[key] = "[MASKED]";
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (typeof item === "string" && isSensitive) {
          return maskSecret(item);
        }
        if (item !== null && typeof item === "object") {
          return maskObjectSecrets(item as Record<string, unknown>);
        }
        return item;
      });
    } else if (value !== null && typeof value === "object") {
      result[key] = maskObjectSecrets(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}
