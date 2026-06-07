import { describe, it, expect } from "vitest";
import { generateToolCallId, resolveToolCallId } from "../domain/tool-call-id.js";

describe("generateToolCallId", () => {
  it("returns a tc_ prefixed ID", () => {
    const id = generateToolCallId("run-1", "tool-a", { x: 1 });
    expect(id).toMatch(/^tc_[a-f0-9]{16}$/);
  });

  it("is deterministic for same inputs", () => {
    const id1 = generateToolCallId("run-1", "tool-a", { x: 1 });
    const id2 = generateToolCallId("run-1", "tool-a", { x: 1 });
    expect(id1).toBe(id2);
  });

  it("differs when runId differs", () => {
    const id1 = generateToolCallId("run-1", "tool-a", { x: 1 });
    const id2 = generateToolCallId("run-2", "tool-a", { x: 1 });
    expect(id1).not.toBe(id2);
  });

  it("differs when toolId differs", () => {
    const id1 = generateToolCallId("run-1", "tool-a", { x: 1 });
    const id2 = generateToolCallId("run-1", "tool-b", { x: 1 });
    expect(id1).not.toBe(id2);
  });

  it("differs when args differ", () => {
    const id1 = generateToolCallId("run-1", "tool-a", { x: 1 });
    const id2 = generateToolCallId("run-1", "tool-a", { x: 2 });
    expect(id1).not.toBe(id2);
  });

  it("is order-insensitive for object keys", () => {
    const id1 = generateToolCallId("run-1", "tool-a", { b: 2, a: 1 });
    const id2 = generateToolCallId("run-1", "tool-a", { a: 1, b: 2 });
    expect(id1).toBe(id2);
  });

  it("handles nested objects", () => {
    const id1 = generateToolCallId("run-1", "tool-a", { nested: { b: 2, a: 1 } });
    const id2 = generateToolCallId("run-1", "tool-a", { nested: { a: 1, b: 2 } });
    expect(id1).toBe(id2);
  });

  it("handles arrays", () => {
    const id1 = generateToolCallId("run-1", "tool-a", [1, 2, 3]);
    const id2 = generateToolCallId("run-1", "tool-a", [1, 2, 3]);
    expect(id1).toBe(id2);
  });

  it("handles null/undefined args", () => {
    const id1 = generateToolCallId("run-1", "tool-a", null);
    const id2 = generateToolCallId("run-1", "tool-a", undefined);
    expect(id1).toBe(id2);
  });
});

describe("resolveToolCallId", () => {
  it("returns sdkToolCallId when provided", () => {
    const id = resolveToolCallId("sdk-id-123", "run-1", "tool-a", { x: 1 });
    expect(id).toBe("sdk-id-123");
  });

  it("generates deterministic ID when sdkToolCallId is undefined", () => {
    const id = resolveToolCallId(undefined, "run-1", "tool-a", { x: 1 });
    expect(id).toMatch(/^tc_[a-f0-9]{16}$/);
  });

  it("returns undefined when both sdkToolCallId and runId are undefined", () => {
    const id = resolveToolCallId(undefined, undefined, "tool-a", { x: 1 });
    expect(id).toBeUndefined();
  });

  it("generates same ID for same inputs", () => {
    const id1 = resolveToolCallId(undefined, "run-1", "tool-a", { x: 1 });
    const id2 = resolveToolCallId(undefined, "run-1", "tool-a", { x: 1 });
    expect(id1).toBe(id2);
  });
});
