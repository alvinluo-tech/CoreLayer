import { describe, it, expect } from "vitest";
import { withStreamTimeout, StreamTimeoutError, DEFAULT_STREAM_TIMEOUT_MS } from "../stream-timeout.js";

async function* mockStream<T>(items: T[], delayMs = 0) {
  for (const item of items) {
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
    yield item;
  }
}

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of source) {
    items.push(item);
  }
  return items;
}

describe("withStreamTimeout", () => {
  it("yields all items from a fast stream", async () => {
    const source = mockStream(["a", "b", "c"]);

    const result = await collect(withStreamTimeout(source, 1000));

    expect(result).toEqual(["a", "b", "c"]);
  });

  it("throws StreamTimeoutError when stream stalls", async () => {
    // Create a stream that delays longer than the timeout
    async function* stalled() {
      await new Promise((r) => setTimeout(r, 5000));
      yield "never";
    }

    await expect(
      collect(withStreamTimeout(stalled(), 50)),
    ).rejects.toThrow(StreamTimeoutError);
  }, 10000);

  it("throws StreamTimeoutError with descriptive message", async () => {
    async function* stalled() {
      await new Promise((r) => setTimeout(r, 5000));
      yield "never";
    }

    await expect(
      collect(withStreamTimeout(stalled(), 100)),
    ).rejects.toThrow("Stream timeout: no chunk received within 100ms");
  }, 10000);

  it("resets timer after each successful yield", async () => {
    // Each item takes 30ms, timeout is 100ms — should complete fine
    const source = mockStream(["a", "b", "c"], 30);

    const result = await collect(withStreamTimeout(source, 100));

    expect(result).toEqual(["a", "b", "c"]);
  });

  it("times out if a later chunk is too slow", async () => {
    async function* slowStart() {
      yield "fast";
      await new Promise((r) => setTimeout(r, 200));
      yield "slow";
    }

    await expect(collect(withStreamTimeout(slowStart(), 100))).rejects.toThrow(StreamTimeoutError);
  });

  it("propagates errors from the source stream", async () => {
    async function* failing() {
      yield "ok";
      throw new Error("source error");
    }

    await expect(collect(withStreamTimeout(failing(), 1000))).rejects.toThrow("source error");
  });

  it("handles empty stream", async () => {
    const source = mockStream([]);

    const result = await collect(withStreamTimeout(source, 1000));

    expect(result).toEqual([]);
  });

  it("exposes DEFAULT_STREAM_TIMEOUT_MS constant", () => {
    expect(DEFAULT_STREAM_TIMEOUT_MS).toBe(120_000);
  });
});
