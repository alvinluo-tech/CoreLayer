import { describe, it, expect } from "vitest";
import { normalizeStream, type SSENormalizedEvent } from "./sse-normalizer.js";

async function collect(source: AsyncIterable<SSENormalizedEvent>): Promise<SSENormalizedEvent[]> {
  const events: SSENormalizedEvent[] = [];
  for await (const event of source) {
    events.push(event);
  }
  return events;
}

async function* mockStream(parts: { type: string; text?: string; toolName?: string; toolCallId?: string; input?: unknown; output?: unknown; args?: unknown; result?: unknown }[]) {
  for (const part of parts) {
    yield part;
  }
}

describe("normalizeStream", () => {
  it("maps text-delta to delta events", async () => {
    const source = mockStream([
      { type: "text-delta", text: "Hello" },
      { type: "text-delta", text: " world" },
    ]);

    const events = await collect(normalizeStream(source));

    expect(events).toEqual([
      { type: "delta", text: "Hello" },
      { type: "delta", text: " world" },
    ]);
  });

  it("maps reasoning-delta to thinking events", async () => {
    const source = mockStream([
      { type: "reasoning-delta", text: "Let me think..." },
      { type: "reasoning-delta", text: " about this" },
    ]);

    const events = await collect(normalizeStream(source));

    expect(events).toEqual([
      { type: "thinking", text: "Let me think..." },
      { type: "thinking", text: " about this" },
    ]);
  });

  it("maps tool-call to tool_calls events", async () => {
    const source = mockStream([
      { type: "tool-call", toolName: "search", toolCallId: "tc-1", input: { query: "test" } },
    ]);

    const events = await collect(normalizeStream(source));

    expect(events).toEqual([
      { type: "tool_calls", name: "search", toolCallId: "tc-1", input: { query: "test" } },
    ]);
  });

  it("maps tool-call with args fallback to tool_calls", async () => {
    const source = mockStream([
      { type: "tool-call", toolName: "search", toolCallId: "tc-1", args: { query: "test" } },
    ]);

    const events = await collect(normalizeStream(source));

    expect(events).toEqual([
      { type: "tool_calls", name: "search", toolCallId: "tc-1", input: { query: "test" } },
    ]);
  });

  it("maps tool-result to tool_result events", async () => {
    const source = mockStream([
      { type: "tool-result", toolName: "search", toolCallId: "tc-1", output: { results: [] } },
    ]);

    const events = await collect(normalizeStream(source));

    expect(events).toEqual([
      { type: "tool_result", name: "search", toolCallId: "tc-1", output: { results: [] } },
    ]);
  });

  it("maps tool-result with result fallback to tool_result", async () => {
    const source = mockStream([
      { type: "tool-result", toolName: "search", toolCallId: "tc-1", result: { results: [] } },
    ]);

    const events = await collect(normalizeStream(source));

    expect(events).toEqual([
      { type: "tool_result", name: "search", toolCallId: "tc-1", output: { results: [] } },
    ]);
  });

  it("handles mixed stream with text, reasoning, and tools", async () => {
    const source = mockStream([
      { type: "text-start", text: undefined },
      { type: "text-delta", text: "I'll " },
      { type: "reasoning-delta", text: "thinking..." },
      { type: "text-delta", text: "search for you" },
      { type: "tool-call", toolName: "search", toolCallId: "tc-1", input: { q: "test" } },
      { type: "tool-result", toolName: "search", toolCallId: "tc-1", output: { data: 42 } },
      { type: "text-delta", text: " Found it!" },
      { type: "text-end", text: undefined },
    ]);

    const events = await collect(normalizeStream(source));

    expect(events).toEqual([
      { type: "delta", text: "I'll " },
      { type: "thinking", text: "thinking..." },
      { type: "delta", text: "search for you" },
      { type: "tool_calls", name: "search", toolCallId: "tc-1", input: { q: "test" } },
      { type: "tool_result", name: "search", toolCallId: "tc-1", output: { data: 42 } },
      { type: "delta", text: " Found it!" },
    ]);
  });

  it("returns empty for empty stream", async () => {
    const source = mockStream([]);

    const events = await collect(normalizeStream(source));

    expect(events).toEqual([]);
  });

  it("skips non-actionable part types", async () => {
    const source = mockStream([
      { type: "start", text: undefined },
      { type: "start-step", text: undefined },
      { type: "text-delta", text: "hello" },
      { type: "finish-step", text: undefined },
      { type: "finish", text: undefined },
      { type: "abort", text: undefined },
    ]);

    const events = await collect(normalizeStream(source));

    expect(events).toEqual([{ type: "delta", text: "hello" }]);
  });

  it("skips text-delta with empty text", async () => {
    const source = mockStream([
      { type: "text-delta", text: "" },
      { type: "text-delta", text: "real" },
    ]);

    const events = await collect(normalizeStream(source));

    expect(events).toEqual([{ type: "delta", text: "real" }]);
  });

  it("handles missing fields gracefully on tool-call", async () => {
    const source = mockStream([
      { type: "tool-call" },
    ]);

    const events = await collect(normalizeStream(source));

    expect(events).toEqual([
      { type: "tool_calls", name: "unknown", toolCallId: "", input: null },
    ]);
  });
});
