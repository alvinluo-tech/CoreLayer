/**
 * Unit tests for agent profile type guards.
 *
 * Validates isAgentModelPolicy(), isAgentExecutorPolicy(), and isValidExecutor()
 * for correct type narrowing and rejection of invalid inputs.
 */

import { describe, it, expect } from "vitest";
import {
  isValidExecutor,
  isAgentModelPolicy,
  isAgentExecutorPolicy,
  BUILT_IN_EXECUTORS,
} from "../agent-profile-types.js";

// ---- isValidExecutor ----

describe("isValidExecutor", () => {
  it("returns true for all valid executor values", () => {
    for (const value of BUILT_IN_EXECUTORS) {
      expect(isValidExecutor(value)).toBe(true);
    }
  });

  it("returns true for 'self'", () => {
    expect(isValidExecutor("self")).toBe(true);
  });

  it("returns true for 'codex'", () => {
    expect(isValidExecutor("codex")).toBe(true);
  });

  it("returns true for 'claude-code'", () => {
    expect(isValidExecutor("claude-code")).toBe(true);
  });

  it("returns true for 'opencode'", () => {
    expect(isValidExecutor("opencode")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(isValidExecutor("")).toBe(false);
  });

  it("accepts registry-extensible executor IDs", () => {
    expect(isValidExecutor("future-executor")).toBe(true);
  });

  it("returns false for number", () => {
    expect(isValidExecutor(42)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isValidExecutor(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isValidExecutor(undefined)).toBe(false);
  });

  it("returns false for object", () => {
    expect(isValidExecutor({ executor: "self" })).toBe(false);
  });

  it("returns false for array", () => {
    expect(isValidExecutor(["self"])).toBe(false);
  });
});

// ---- isAgentModelPolicy ----

describe("isAgentModelPolicy", () => {
  it("returns true for empty object", () => {
    expect(isAgentModelPolicy({})).toBe(true);
  });

  it("returns true for valid policy with all fields", () => {
    expect(
      isAgentModelPolicy({
        preferredModels: ["claude-opus-4-5", "claude-sonnet-4-6"],
        fallbackModel: "claude-haiku-4-5",
        maxTokens: 4096,
        temperature: 0.7,
        provider: "anthropic",
      }),
    ).toBe(true);
  });

  it("returns true for policy with only preferredModels", () => {
    expect(
      isAgentModelPolicy({
        preferredModels: ["gpt-4o"],
      }),
    ).toBe(true);
  });

  it("returns true for policy with only temperature", () => {
    expect(isAgentModelPolicy({ temperature: 1.0 })).toBe(true);
  });

  it("returns false for null", () => {
    expect(isAgentModelPolicy(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isAgentModelPolicy(undefined)).toBe(false);
  });

  it("returns false for primitive string", () => {
    expect(isAgentModelPolicy("not-an-object")).toBe(false);
  });

  it("returns false for number", () => {
    expect(isAgentModelPolicy(42)).toBe(false);
  });

  it("returns false when preferredModels is not an array", () => {
    expect(isAgentModelPolicy({ preferredModels: "not-array" })).toBe(false);
  });

  it("returns false when preferredModels is an object", () => {
    expect(isAgentModelPolicy({ preferredModels: { 0: "model" } })).toBe(false);
  });

  it("returns false when fallbackModel is not a string", () => {
    expect(isAgentModelPolicy({ fallbackModel: 123 })).toBe(false);
  });

  it("returns false when maxTokens is not a number", () => {
    expect(isAgentModelPolicy({ maxTokens: "big" })).toBe(false);
  });

  it("returns false when temperature is not a number", () => {
    expect(isAgentModelPolicy({ temperature: "warm" })).toBe(false);
  });

  it("returns false when provider is not a string", () => {
    expect(isAgentModelPolicy({ provider: 123 })).toBe(false);
  });
});

// ---- isAgentExecutorPolicy ----

describe("isAgentExecutorPolicy", () => {
  it("returns true for valid policy with all fields", () => {
    expect(
      isAgentExecutorPolicy({
        executor: "claude-code",
        maxConcurrent: 2,
        workDir: "/tmp/repo",
        extraArgs: ["--verbose"],
      }),
    ).toBe(true);
  });

  it("returns true for valid policy with only executor", () => {
    expect(isAgentExecutorPolicy({ executor: "self" })).toBe(true);
  });

  it("returns true for each valid executor type", () => {
    for (const executor of BUILT_IN_EXECUTORS) {
      expect(isAgentExecutorPolicy({ executor })).toBe(true);
    }
  });

  it("returns false for null", () => {
    expect(isAgentExecutorPolicy(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isAgentExecutorPolicy(undefined)).toBe(false);
  });

  it("returns false for empty object (missing executor)", () => {
    expect(isAgentExecutorPolicy({})).toBe(false);
  });

  it("returns true for a future registry executor", () => {
    expect(isAgentExecutorPolicy({ executor: "future-executor" })).toBe(true);
  });

  it("returns false when maxConcurrent is not a number", () => {
    expect(isAgentExecutorPolicy({ executor: "self", maxConcurrent: "many" })).toBe(false);
  });

  it("returns false when workDir is not a string", () => {
    expect(isAgentExecutorPolicy({ executor: "self", workDir: 42 })).toBe(false);
  });

  it("returns false when extraArgs is not an array", () => {
    expect(isAgentExecutorPolicy({ executor: "self", extraArgs: "not-array" })).toBe(false);
  });

  it("returns false when executor is a number", () => {
    expect(isAgentExecutorPolicy({ executor: 1 })).toBe(false);
  });

  it("returns false for primitive string", () => {
    expect(isAgentExecutorPolicy("self")).toBe(false);
  });
});
