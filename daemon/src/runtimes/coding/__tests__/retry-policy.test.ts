import { describe, it, expect } from "vitest";
import { classifyFailure, decideRetry } from "../retry-policy.js";

describe("classifyFailure", () => {
  it("should classify timeout errors", () => {
    expect(classifyFailure("Process timed out")).toBe("timeout");
    expect(classifyFailure("Request timed out after 30s")).toBe("timeout");
  });

  it("should classify cancellation", () => {
    expect(classifyFailure("Cancelled by user")).toBe("user_cancelled");
  });

  it("should classify permission errors", () => {
    expect(classifyFailure("Permission denied")).toBe("permission_denied");
    expect(classifyFailure("blocked_by_executor_permission")).toBe("permission_blocked");
  });

  it("should classify executor not found", () => {
    expect(classifyFailure("ENOENT: command not found")).toBe("executor_not_available");
  });

  it("should classify rate limits", () => {
    expect(classifyFailure("Rate limit exceeded")).toBe("transient_provider_error");
    expect(classifyFailure("529 overloaded")).toBe("transient_provider_error");
  });

  it("should classify exit codes", () => {
    expect(classifyFailure("killed", 137)).toBe("timeout");
    expect(classifyFailure("terminated", 143)).toBe("user_cancelled");
  });

  it("should default to unknown", () => {
    expect(classifyFailure("Something weird happened")).toBe("unknown");
  });
});

describe("decideRetry", () => {
  it("should allow retry for transient errors", () => {
    const decision = decideRetry("transient_provider_error", 0);
    expect(decision.shouldRetry).toBe(true);
    expect(decision.delayMs).toBe(5000);
  });

  it("should deny retry for permission denied", () => {
    const decision = decideRetry("permission_denied", 0);
    expect(decision.shouldRetry).toBe(false);
  });

  it("should deny retry for user cancelled", () => {
    const decision = decideRetry("user_cancelled", 0);
    expect(decision.shouldRetry).toBe(false);
  });

  it("should deny retry after max retries", () => {
    const decision = decideRetry("transient_provider_error", 3);
    expect(decision.shouldRetry).toBe(false);
  });

  it("should require fresh environment for policy violations", () => {
    const decision = decideRetry("sandbox_policy_violation", 0);
    expect(decision.shouldRetry).toBe(false); // max is 0
  });

  it("should require fresh environment for verification failures", () => {
    const decision = decideRetry("verification_failed", 0);
    expect(decision.shouldRetry).toBe(true);
    expect(decision.freshEnvironment).toBe(true);
  });
});
