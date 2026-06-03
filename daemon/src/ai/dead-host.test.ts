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

  it("should use exponential backoff: 20s → 40s → 80s → 160s", () => {
    vi.useFakeTimers();

    // First cooldown: 20s
    manager.recordFailure("groq");
    manager.recordFailure("groq");
    expect(manager.isDead("groq")).toBe(true);
    expect(manager.remainingCooldown("groq")).toBeLessThanOrEqual(20_000);

    // Expire first cooldown
    vi.advanceTimersByTime(21_000);
    expect(manager.isDead("groq")).toBe(false);

    // Second cooldown: 40s
    manager.recordFailure("groq");
    manager.recordFailure("groq");
    expect(manager.isDead("groq")).toBe(true);
    expect(manager.remainingCooldown("groq")).toBeLessThanOrEqual(40_000);
    expect(manager.remainingCooldown("groq")).toBeGreaterThan(20_000);

    // Expire second cooldown
    vi.advanceTimersByTime(41_000);
    expect(manager.isDead("groq")).toBe(false);

    // Third cooldown: 80s
    manager.recordFailure("groq");
    manager.recordFailure("groq");
    expect(manager.isDead("groq")).toBe(true);
    expect(manager.remainingCooldown("groq")).toBeLessThanOrEqual(80_000);
    expect(manager.remainingCooldown("groq")).toBeGreaterThan(40_000);

    // Expire third cooldown
    vi.advanceTimersByTime(81_000);
    expect(manager.isDead("groq")).toBe(false);

    // Fourth cooldown: 160s (capped)
    manager.recordFailure("groq");
    manager.recordFailure("groq");
    expect(manager.isDead("groq")).toBe(true);
    expect(manager.remainingCooldown("groq")).toBeLessThanOrEqual(160_000);
    expect(manager.remainingCooldown("groq")).toBeGreaterThan(80_000);

    // Fifth cooldown: still 160s (cap)
    vi.advanceTimersByTime(161_000);
    expect(manager.isDead("groq")).toBe(false);
    manager.recordFailure("groq");
    manager.recordFailure("groq");
    expect(manager.remainingCooldown("groq")).toBeLessThanOrEqual(160_000);

    vi.useRealTimers();
  });

  it("should reset backoff on success", () => {
    vi.useFakeTimers();

    // Trigger first cooldown
    manager.recordFailure("groq");
    manager.recordFailure("groq");
    vi.advanceTimersByTime(21_000);
    expect(manager.isDead("groq")).toBe(false);

    // Reset via success
    manager.recordSuccess("groq");

    // Next failure should start at 20s again
    manager.recordFailure("groq");
    manager.recordFailure("groq");
    expect(manager.remainingCooldown("groq")).toBeLessThanOrEqual(20_000);

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
