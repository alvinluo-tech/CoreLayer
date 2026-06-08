/**
 * Regression tests for error handling utilities.
 *
 * BUG-E1: classifyError must return correct HTTP status for known error patterns
 * BUG-E2: extractErrorMessage must handle all thrown value types safely
 * BUG-E3: apiError must always return { error: string } shape
 * BUG-E4: ErrorCodes constants must match classifyError outputs
 */

import { describe, it, expect, vi } from "vitest";
import {
  classifyError,
  extractErrorMessage,
  logError,
  apiError,
  ErrorCodes,

  type AppErrorStatus,
} from "./errors.js";

// ---- BUG-E1: classifyError status code mapping ----

describe("classifyError", () => {
  it("returns 503 NOT_CONFIGURED for 'not configured' errors", () => {
    const result = classifyError(new Error("Provider not configured"));
    expect(result.status).toBe(503);
    expect(result.code).toBe(ErrorCodes.NOT_CONFIGURED);
  });

  it("returns 503 NOT_CONFIGURED for 'api key' errors", () => {
    const result = classifyError(new Error("Missing api key"));
    expect(result.status).toBe(503);
    expect(result.code).toBe(ErrorCodes.NOT_CONFIGURED);
  });

  it("returns 503 NOT_CONFIGURED for 'missing key' errors", () => {
    const result = classifyError("Missing key for provider");
    expect(result.status).toBe(503);
    expect(result.code).toBe(ErrorCodes.NOT_CONFIGURED);
  });

  it("returns 401 AI_ERROR for 'unauthorized' errors", () => {
    const result = classifyError(new Error("Unauthorized access"));
    expect(result.status).toBe(401);
    expect(result.code).toBe(ErrorCodes.AI_ERROR);
  });

  it("returns 503 NOT_CONFIGURED for 'invalid api key' (matches 'api key' first)", () => {
    // "api key" pattern is checked before "invalid api key" in classifyError
    const result = classifyError(new Error("Invalid API key provided"));
    expect(result.status).toBe(503);
    expect(result.code).toBe(ErrorCodes.NOT_CONFIGURED);
  });

  it("returns 401 AI_ERROR for errors containing '401'", () => {
    const result = classifyError(new Error("HTTP 401: Unauthorized"));
    expect(result.status).toBe(401);
    expect(result.code).toBe(ErrorCodes.AI_ERROR);
  });

  it("returns 404 NOT_FOUND for 'not found' errors", () => {
    const result = classifyError(new Error("Resource not found"));
    expect(result.status).toBe(404);
    expect(result.code).toBe(ErrorCodes.NOT_FOUND);
  });

  it("returns 404 NOT_FOUND for 'no such' errors", () => {
    const result = classifyError("No such table: foo");
    expect(result.status).toBe(404);
    expect(result.code).toBe(ErrorCodes.NOT_FOUND);
  });

  it("returns 503 NETWORK_ERROR for 'network' errors", () => {
    const result = classifyError(new Error("Network request failed"));
    expect(result.status).toBe(503);
    expect(result.code).toBe(ErrorCodes.NETWORK_ERROR);
  });

  it("returns 503 NETWORK_ERROR for 'econnrefused' errors", () => {
    const result = classifyError(new Error("connect ECONNREFUSED 127.0.0.1:3001"));
    expect(result.status).toBe(503);
    expect(result.code).toBe(ErrorCodes.NETWORK_ERROR);
  });

  it("returns 503 NETWORK_ERROR for 'fetch failed' errors", () => {
    const result = classifyError(new Error("fetch failed"));
    expect(result.status).toBe(503);
    expect(result.code).toBe(ErrorCodes.NETWORK_ERROR);
  });

  it("returns 503 NETWORK_ERROR for 'timeout' errors", () => {
    const result = classifyError(new Error("Request timeout after 30000ms"));
    expect(result.status).toBe(503);
    expect(result.code).toBe(ErrorCodes.NETWORK_ERROR);
  });

  it("returns 500 AI_ERROR for unknown errors (default)", () => {
    const result = classifyError(new Error("Something went wrong"));
    expect(result.status).toBe(500);
    expect(result.code).toBe(ErrorCodes.AI_ERROR);
  });

  it("returns 429 RATE_LIMITED for rate limit errors", () => {
    const result = classifyError(new Error("Rate limit exceeded"));
    expect(result.status).toBe(429);
    expect(result.code).toBe(ErrorCodes.RATE_LIMITED);
    expect(result.retryable).toBe(true);
  });

  it("returns 403 PERMISSION_DENIED for permission errors", () => {
    const result = classifyError(new Error("Permission denied"));
    expect(result.status).toBe(403);
    expect(result.code).toBe(ErrorCodes.PERMISSION_DENIED);
    expect(result.retryable).toBe(false);
  });

  it("marks network errors as retryable", () => {
    const result = classifyError(new Error("Network request failed"));
    expect(result.retryable).toBe(true);
  });

  it("marks not-configured errors as non-retryable", () => {
    const result = classifyError(new Error("Provider not configured"));
    expect(result.retryable).toBe(false);
  });

  it("is case-insensitive", () => {
    const result = classifyError(new Error("NOT CONFIGURED"));
    expect(result.status).toBe(503);
    expect(result.code).toBe(ErrorCodes.NOT_CONFIGURED);
  });
});

// ---- BUG-E2: extractErrorMessage handles all types ----

describe("extractErrorMessage", () => {
  it("extracts message from Error objects", () => {
    expect(extractErrorMessage(new Error("test"))).toBe("test");
  });

  it("passes through string values", () => {
    expect(extractErrorMessage("raw string")).toBe("raw string");
  });

  it("stringifies objects", () => {
    const result = extractErrorMessage({ code: 500, detail: "bad" });
    expect(result).toContain("500");
    expect(result).toContain("bad");
  });

  it("handles null/undefined safely", () => {
    expect(extractErrorMessage(null)).toBe("null");
    expect(extractErrorMessage(undefined)).toBe(undefined);
  });
});

// ---- BUG-E3: ErrorResponse shape contract ----

describe("ErrorResponse shape", () => {
  it("ErrorCodes constants are stable", () => {
    expect(ErrorCodes.NOT_CONFIGURED).toBe("NOT_CONFIGURED");
    expect(ErrorCodes.NOT_FOUND).toBe("NOT_FOUND");
    expect(ErrorCodes.VALIDATION).toBe("VALIDATION");
    expect(ErrorCodes.AI_ERROR).toBe("AI_ERROR");
    expect(ErrorCodes.DB_ERROR).toBe("DB_ERROR");
    expect(ErrorCodes.NETWORK_ERROR).toBe("NETWORK_ERROR");
    expect(ErrorCodes.UPSTREAM_ERROR).toBe("UPSTREAM_ERROR");
  });

  it("classifyError always returns valid status and code", () => {
    const testCases = [
      "not configured",
      "api key missing",
      "unauthorized",
      "not found",
      "network error",
      "econnrefused",
      "timeout",
      "something random",
      "",
    ];

    const validStatuses: AppErrorStatus[] = [400, 401, 403, 404, 409, 429, 500, 503];

    for (const msg of testCases) {
      const result = classifyError(msg);
      expect(validStatuses).toContain(result.status);
      expect(typeof result.code).toBe("string");
      expect(result.code.length).toBeGreaterThan(0);
    }
  });
});

// ---- BUG-E5: logError must log structured prefix ----

describe("logError", () => {
  it("logs error message with structured prefix", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError("test-context", new Error("something broke"));
    expect(spy).toHaveBeenCalledWith("[Jarvis][test-context]", "something broke");
    spy.mockRestore();
  });

  it("logs stack trace for Error objects", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("with stack");
    logError("ctx", err);
    // Second call is the stack
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
    spy.mockRestore();
  });

  it("logs raw value for non-Error types", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError("ctx", "raw string error");
    expect(spy).toHaveBeenCalledWith("[Jarvis][ctx]", "raw string error");
    spy.mockRestore();
  });
});

// ---- BUG-E6: apiError must return consistent shape ----

describe("apiError", () => {
  function mockContext() {
    let capturedBody: unknown;
    let capturedStatus: number | undefined;
    return {
      json(body: unknown, status?: number) {
        capturedBody = body;
        capturedStatus = status;
        return { body, status };
      },
      get captured() {
        return { body: capturedBody, status: capturedStatus };
      },
    };
  }

  it("returns { error } with default 500 status", () => {
    const c = mockContext();
    apiError(c as any, "test error");
    expect(c.captured.body).toEqual({ error: "test error" });
    expect(c.captured.status).toBe(500);
  });

  it("returns { error } with custom status", () => {
    const c = mockContext();
    apiError(c as any, "not found", 404);
    expect(c.captured.body).toEqual({ error: "not found" });
    expect(c.captured.status).toBe(404);
  });

  it("includes code when provided", () => {
    const c = mockContext();
    apiError(c as any, "not configured", 503, "NOT_CONFIGURED");
    expect(c.captured.body).toEqual({ error: "not configured", code: "NOT_CONFIGURED" });
  });
});
