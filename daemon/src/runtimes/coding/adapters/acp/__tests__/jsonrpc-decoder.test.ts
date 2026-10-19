import { describe, it, expect } from "vitest";
import {
  AcpStreamDecoder,
  isErrorResponse,
  isPermissionRequest,
  isPromptResponse,
  isSessionUpdate,
} from "../jsonrpc-decoder.js";

describe("AcpStreamDecoder", () => {
  it("splits newline-delimited JSON-RPC messages", () => {
    const decoder = new AcpStreamDecoder();
    const messages = decoder.push(
      '{"jsonrpc":"2.0","id":1,"method":"session/new"}\n{"jsonrpc":"2.0","method":"session/update"}\n',
    );

    expect(messages).toHaveLength(2);
    expect(messages[0].method).toBe("session/new");
    expect(messages[1].method).toBe("session/update");
  });

  it("reassembles a message split across chunks", () => {
    const decoder = new AcpStreamDecoder();
    expect(decoder.push('{"jsonrpc":"2.0","id":')).toEqual([]);
    const messages = decoder.push('7,"result":{}}\n');
    expect(messages).toEqual([{ jsonrpc: "2.0", id: 7, result: {} }]);
  });

  it("ignores non-JSON lines that acpx can interleave", () => {
    const decoder = new AcpStreamDecoder();
    const messages = decoder.push('Starting agent...\n{"jsonrpc":"2.0","id":1,"result":{}}\nplain text\n');
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe(1);
  });

  it("ignores malformed JSON without losing the stream", () => {
    const decoder = new AcpStreamDecoder();
    const messages = decoder.push('{"broken":\n{"jsonrpc":"2.0","id":2,"result":{}}\n');
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe(2);
  });

  it("flushes a trailing line with no newline", () => {
    const decoder = new AcpStreamDecoder();
    decoder.push('{"jsonrpc":"2.0","id":9,"result":{}}');
    expect(decoder.flush()).toEqual([{ jsonrpc: "2.0", id: 9, result: {} }]);
    expect(decoder.flush()).toEqual([]);
  });
});

describe("message classifiers", () => {
  it("recognises a session update notification", () => {
    expect(isSessionUpdate({ jsonrpc: "2.0", method: "session/update", params: {} })).toBe(true);
    expect(isSessionUpdate({ jsonrpc: "2.0", id: 3, method: "session/update" })).toBe(false);
  });

  it("recognises a permission request", () => {
    expect(isPermissionRequest({ jsonrpc: "2.0", id: 5, method: "session/request_permission" })).toBe(true);
    expect(isPermissionRequest({ jsonrpc: "2.0", method: "session/request_permission" })).toBe(false);
  });

  it("recognises a prompt response and an error response", () => {
    expect(isPromptResponse({ jsonrpc: "2.0", id: 2, result: { stopReason: "end_turn" } })).toBe(true);
    expect(isPromptResponse({ jsonrpc: "2.0", id: 2, error: { message: "boom" } })).toBe(true);
    expect(isPromptResponse({ jsonrpc: "2.0", id: 2, method: "session/prompt" })).toBe(false);

    expect(isErrorResponse({ jsonrpc: "2.0", id: 2, error: { message: "boom" } })).toBe(true);
    expect(isErrorResponse({ jsonrpc: "2.0", id: 2, result: {} })).toBe(false);
  });
});
