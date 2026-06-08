import type { Context } from "hono";

// ─── Standard HTTP status codes used by this app ────────────────────────────
export type AppErrorStatus = 400 | 401 | 403 | 404 | 409 | 429 | 500 | 502 | 503;

/**
 * Standard error response shape — used by EVERY route in this app.
 * Consumers should always check for `{ error: string }` on non-2xx responses.
 */
export interface ErrorResponse {
  error: string;
  /** Machine-readable error code for the frontend to branch on */
  code?: string;
  /** Whether the client should retry this request */
  retryable?: boolean;
  /** Seconds to wait before retrying (hint for backoff) */
  retryAfter?: number;
  /** Additional context for debugging (safe to display) */
  details?: unknown;
}

/**
 * Create a standardised JSON error response.
 * Always use this instead of hand-crafting `c.json({ error: ... }, status)`.
 */
export function apiError(
  c: Context,
  message: string,
  status: AppErrorStatus = 500,
  code?: string,
  options?: { retryable?: boolean; retryAfter?: number; details?: unknown },
) {
  const body: ErrorResponse = { error: message };
  if (code) body.code = code;
  if (options?.retryable !== undefined) body.retryable = options.retryable;
  if (options?.retryAfter !== undefined) body.retryAfter = options.retryAfter;
  if (options?.details !== undefined) body.details = options.details;
  return c.json(body, status);
}

// ─── Error code constants ────────────────────────────────────────────────────
export const ErrorCodes = {
  NOT_CONFIGURED: "NOT_CONFIGURED",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION: "VALIDATION",
  AI_ERROR: "AI_ERROR",
  DB_ERROR: "DB_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  RUNTIME_ERROR: "RUNTIME_ERROR",
} as const;

/**
 * Extract a clean, human-readable message from any thrown value.
 * Handles Error objects, strings, and unknown types safely.
 */
export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

/**
 * Classify a thrown error into an appropriate HTTP status code.
 * Inspects message text for known patterns (auth, not found, etc.).
 */
export function classifyError(err: unknown): {
  status: AppErrorStatus;
  code: string;
  retryable: boolean;
  retryAfter?: number;
} {
  const msg = extractErrorMessage(err).toLowerCase();

  if (
    msg.includes("not configured") ||
    msg.includes("api key") ||
    msg.includes("missing key")
  ) {
    return { status: 503, code: ErrorCodes.NOT_CONFIGURED, retryable: false };
  }

  if (
    msg.includes("unauthorized") ||
    msg.includes("invalid api key") ||
    msg.includes("401")
  ) {
    return { status: 401, code: ErrorCodes.AI_ERROR, retryable: false };
  }

  if (msg.includes("rate limit") || msg.includes("429")) {
    const retryAfter = parseRetryAfter(msg);
    return { status: 429, code: ErrorCodes.RATE_LIMITED, retryable: true, retryAfter };
  }

  if (msg.includes("permission denied") || msg.includes("forbidden") || msg.includes("403")) {
    return { status: 403, code: ErrorCodes.PERMISSION_DENIED, retryable: false };
  }

  if (msg.includes("not found") || msg.includes("no such")) {
    return { status: 404, code: ErrorCodes.NOT_FOUND, retryable: false };
  }

  if (
    msg.includes("network") ||
    msg.includes("econnrefused") ||
    msg.includes("fetch failed") ||
    msg.includes("timeout")
  ) {
    return { status: 503, code: ErrorCodes.NETWORK_ERROR, retryable: true };
  }

  return { status: 500, code: ErrorCodes.AI_ERROR, retryable: false };
}

function parseRetryAfter(msg: string): number | undefined {
  const match = msg.match(/retry[_\s]?after[:\s]*(\d+)/i);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Log a server-side error with structured prefix for easy grepping.
 */
export function logError(context: string, err: unknown): void {
  console.error(`[Jarvis][${context}]`, err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
}
