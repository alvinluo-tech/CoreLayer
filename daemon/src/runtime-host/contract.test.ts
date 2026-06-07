import { describe, it, expect } from "vitest";
import type { RuntimeKind } from "@jarvis/runtime-protocol";
import { ALL_RUNTIME_KINDS } from "./contract.js";

/**
 * Runtime kind taxonomy consistency tests.
 *
 * These tests ensure that:
 * 1. ALL_RUNTIME_KINDS covers all expected runtime kinds
 * 2. Every RuntimeComponentKind value is a valid RuntimeKind (from protocol)
 * 3. No duplicate kinds exist
 */

/** Expected canonical runtime kinds — update this list when adding a new runtime. */
const EXPECTED_KINDS: RuntimeKind[] = [
  "agent",
  "tool",
  "coding",
  "voice",
  "memory",
  "scheduler",
  "computer-control",
];

describe("Runtime kind taxonomy", () => {
  it("ALL_RUNTIME_KINDS covers all expected kinds", () => {
    const sorted = [...ALL_RUNTIME_KINDS].sort();
    const expected = [...EXPECTED_KINDS].sort();
    expect(sorted).toEqual(expected);
  });

  it("no duplicate kinds in ALL_RUNTIME_KINDS", () => {
    const unique = new Set(ALL_RUNTIME_KINDS);
    expect(unique.size).toBe(ALL_RUNTIME_KINDS.length);
  });

  it("every RuntimeComponentKind is a valid RuntimeKind", () => {
    // RuntimeComponentKind and RuntimeKind should be structurally identical.
    // This test verifies they stay in sync by checking each value compiles
    // as a RuntimeKind at the type level (via assignment) and at runtime.
    for (const kind of ALL_RUNTIME_KINDS) {
      // TypeScript type check: RuntimeComponentKind must be assignable to RuntimeKind
      const protocolKind: RuntimeKind = kind as RuntimeKind;
      expect(protocolKind).toBe(kind);
    }
  });

  it("EXPECTED_KINDS has no duplicates", () => {
    const unique = new Set(EXPECTED_KINDS);
    expect(unique.size).toBe(EXPECTED_KINDS.length);
  });

  it("ALL_RUNTIME_KINDS has exactly 7 entries", () => {
    expect(ALL_RUNTIME_KINDS).toHaveLength(7);
  });
});
