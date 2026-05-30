import { describe, it, expect, vi } from "vitest";
import { createSSEParser, type SSEEvent } from "./sseParser.js";

describe("createSSEParser", () => {
  it("parses a single complete event in one chunk", () => {
    const events: SSEEvent[] = [];
    const parser = createSSEParser({
      onEvent: (e) => events.push(e),
    });

    parser.feed("data: hello\n\n");

    expect(events).toEqual([{ event: "token", data: "hello" }]);
  });

  it("parses multiple events in one chunk", () => {
    const events: SSEEvent[] = [];
    const parser = createSSEParser({
      onEvent: (e) => events.push(e),
    });

    parser.feed("data: first\n\ndata: second\n\n");

    expect(events).toEqual([
      { event: "token", data: "first" },
      { event: "token", data: "second" },
    ]);
  });

  it("buffers partial lines across chunks", () => {
    const events: SSEEvent[] = [];
    const parser = createSSEParser({
      onEvent: (e) => events.push(e),
    });

    parser.feed("data: hel");
    expect(events).toEqual([]);

    parser.feed("lo\n\n");

    expect(events).toEqual([{ event: "token", data: "hello" }]);
  });

  it("flush fires remaining buffer as a data event", () => {
    const events: SSEEvent[] = [];
    const parser = createSSEParser({
      onEvent: (e) => events.push(e),
    });

    parser.feed("data: leftover");
    parser.flush();

    expect(events).toEqual([{ event: "token", data: "leftover" }]);
  });

  it("flush on empty buffer is a no-op", () => {
    const onEvent = vi.fn();
    const parser = createSSEParser({ onEvent });

    parser.flush();

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("reset clears buffer and resets event type", () => {
    const events: SSEEvent[] = [];
    const parser = createSSEParser({
      onEvent: (e) => events.push(e),
    });

    parser.feed("event: custom\ndata: partial");
    parser.reset();

    // After reset, feeding new data should use default "token" event type
    parser.feed("data: after-reset\n\n");

    expect(events).toEqual([{ event: "token", data: "after-reset" }]);
  });

  it("tracks custom event type", () => {
    const events: SSEEvent[] = [];
    const parser = createSSEParser({
      onEvent: (e) => events.push(e),
    });

    parser.feed("event: custom\ndata: payload\n\n");

    expect(events).toEqual([{ event: "custom", data: "payload" }]);
  });

  it("skips empty data lines", () => {
    const events: SSEEvent[] = [];
    const parser = createSSEParser({
      onEvent: (e) => events.push(e),
    });

    // "data: " with nothing after it — data is empty string, should be skipped
    parser.feed("data: \n\n");
    parser.feed("data: valid\n\n");

    expect(events).toEqual([{ event: "token", data: "valid" }]);
  });

  it("ignores malformed lines", () => {
    const events: SSEEvent[] = [];
    const parser = createSSEParser({
      onEvent: (e) => events.push(e),
    });

    parser.feed("this is not valid SSE\ndata: ok\n\n");

    expect(events).toEqual([{ event: "token", data: "ok" }]);
  });
});
