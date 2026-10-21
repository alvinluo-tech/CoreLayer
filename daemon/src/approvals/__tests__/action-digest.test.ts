import { describe, it, expect } from "vitest";
import { actionDigest, canonicalize, matchesApprovedAction } from "../action-digest.js";

describe("canonicalize", () => {
  it("sorts object keys so equivalent calls hash alike", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  it("drops undefined members but keeps null", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe(canonicalize({ a: 1 }));
    expect(canonicalize({ a: null })).not.toBe(canonicalize({}));
  });

  it("distinguishes argument values that differ", () => {
    expect(canonicalize({ path: "a.txt" })).not.toBe(canonicalize({ path: "b.txt" }));
    expect(canonicalize({ n: 1 })).not.toBe(canonicalize({ n: "1" }));
  });

  it("normalises negative zero and rejects non-finite numbers", () => {
    expect(canonicalize(-0)).toBe(canonicalize(0));
    expect(() => canonicalize(Number.NaN)).toThrow(TypeError);
    expect(() => canonicalize(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });

  it("rejects circular structures", () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(() => canonicalize(value)).toThrow(TypeError);
  });

  it("serialises dates by value", () => {
    expect(canonicalize(new Date("2026-01-01T00:00:00Z"))).toBe('{"$date":"2026-01-01T00:00:00.000Z"}');
  });
});

describe("actionDigest", () => {
  it("is stable across key order", () => {
    expect(actionDigest("write_file", { path: "a", content: "x" })).toBe(
      actionDigest("write_file", { content: "x", path: "a" }),
    );
  });

  it("changes when the tool or the arguments change", () => {
    const base = actionDigest("exec", { command: "ls" });
    expect(actionDigest("read_file", { command: "ls" })).not.toBe(base);
    expect(actionDigest("exec", { command: "rm -rf /" })).not.toBe(base);
  });
});

describe("matchesApprovedAction", () => {
  it("accepts the exact call that was approved", () => {
    expect(matchesApprovedAction(actionDigest("exec", { command: "ls" }), "exec", { command: "ls" })).toBe(true);
  });

  it("rejects a substituted call", () => {
    const approved = actionDigest("exec", { command: "ls" });
    expect(matchesApprovedAction(approved, "exec", { command: "rm -rf /" })).toBe(false);
  });

  it("keeps approving pre-digest rows rather than failing every in-flight approval", () => {
    expect(matchesApprovedAction(null, "exec", { command: "ls" })).toBe(true);
    expect(matchesApprovedAction(undefined, "exec", { command: "ls" })).toBe(true);
  });
});
