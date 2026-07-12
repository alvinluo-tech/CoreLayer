import { describe, expect, it } from "vitest";
import { JsonlEventDecoder } from "./jsonl-decoder.js";

describe("JsonlEventDecoder", () => {
  it("preserves split JSONL frames and native session identifiers", () => {
    const decoder = new JsonlEventDecoder();
    expect(decoder.push('{"type":"thread.started","thread_id":"abc"')).toEqual([]);
    expect(decoder.push('}\n{"text":"done","turn_id":"turn-1"}\n')).toEqual([
      { text: '{"type":"thread.started","thread_id":"abc"}', native: { type: "thread.started", thread_id: "abc" } },
      { text: "done", native: { text: "done", turn_id: "turn-1" } },
    ]);
  });
});
