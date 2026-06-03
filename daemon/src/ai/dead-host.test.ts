import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeadHostManager } from "./dead-host.js";

describe("DeadHostManager", () => {
  let manager: DeadHostManager;

  beforeEach(() => {
    manager = new DeadHostManager();
  });

  it("should not be dead initially", () => {
    expect(manager.isDead("groq")).toBe(false);
  });

  it("should not be dead after 1 failure", () => {
    manager.recordFailure("groq");
    expect(manager.isDead("groq")).toBe(false);
  });

  it("should be dead after 2 consecutive failures", () => {
    manager.recordFailure("groq");
    manager.recordFailure("groq");
    expect(manager.isDead("groq")).toBe(true);
  });

  it("should reset failure count on success", () => {
    manager.recordFailure("groq");
    manager.recordSuccess("groq");
    manager.recordFailure("groq");
    expect(manager.isDead("groq")).toBe(false); // only 1 failure after reset
  });

  it("should auto-recover after cooldown expires", () => {
    vi.useFakeTimers();
    manager.recordFailure("groq");
    manager.recordFailure("groq");
    expect(manager.isDead("groq")).toBe(true);

    // Advance past 20s cooldown
    vi.advanceTimersByTime(21_000);
    expect(manager.isDead("groq")).toBe(false);
    vi.useRealTimers();
  });

  it("should track providers independently", () => {
    manager.recordFailure("groq");
    manager.recordFailure("groq");
    expect(manager.isDead("groq")).toBe(true);
    expect(manager.isDead("openrouter")).toBe(false);
  });

  it("should return remaining cooldown ms", () => {
    vi.useFakeTimers();
    manager.recordFailure("groq");
    manager.recordFailure("groq");

    const remaining = manager.remainingCooldown("groq");
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(20_000);

    vi.advanceTimersByTime(10_000);
    expect(manager.remainingCooldown("groq")).toBeLessThanOrEqual(10_000);

    vi.advanceTimersByTime(11_000);
    expect(manager.remainingCooldown("groq")).toBe(0);
    vi.useRealTimers();
  });

  it("should return 0 remaining cooldown for non-dead host", () => {
    expect(manager.remainingCooldown("groq")).toBe(0);
  });

  it("should handle recordSuccess for unknown provider", () => {
    // Should not throw
    manager.recordSuccess("unknown");
    expect(manager.isDead("unknown")).toBe(false);
  });
});
