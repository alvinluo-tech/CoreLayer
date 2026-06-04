import { describe, it, expect } from "vitest";

/**
 * Tests for SSE disconnect propagation pattern used in chat.ts and conversations.ts.
 *
 * Both routes wire c.req.raw.signal.addEventListener("abort", () => controller.abort())
 * to propagate client disconnects to the upstream AI stream. These tests verify the
 * abort-signal wiring pattern works correctly without needing full Hono route setup.
 */

describe("SSE disconnect propagation pattern", () => {
  it("should abort upstream controller when client signal fires", () => {
    const clientAbort = new AbortController();
    const upstreamAbort = new AbortController();

    // Simulate the wiring from chat.ts / conversations.ts
    clientAbort.signal.addEventListener("abort", () => {
      upstreamAbort.abort();
    });

    // Client disconnects
    clientAbort.abort();

    expect(upstreamAbort.signal.aborted).toBe(true);
  });

  it("should not abort upstream if client signal is never fired", () => {
    const clientAbort = new AbortController();
    const upstreamAbort = new AbortController();

    clientAbort.signal.addEventListener("abort", () => {
      upstreamAbort.abort();
    });

    // Client does NOT disconnect
    expect(upstreamAbort.signal.aborted).toBe(false);
  });

  it("should propagate abort reason from client to upstream", () => {
    const clientAbort = new AbortController();
    const upstreamAbort = new AbortController();

    clientAbort.signal.addEventListener("abort", () => {
      upstreamAbort.abort(clientAbort.signal.reason);
    });

    clientAbort.abort("client disconnect");

    expect(upstreamAbort.signal.aborted).toBe(true);
    expect(upstreamAbort.signal.reason).toBe("client disconnect");
  });
});
