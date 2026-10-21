import { describe, it, expect } from "vitest";
import { createStderrBuffer } from "../stderr-buffer.js";

describe("createStderrBuffer", () => {
  it("keeps the tail of a noisy stream", () => {
    const buffer = createStderrBuffer(1024, 200);
    for (let i = 0; i < 50; i += 1) buffer.push(`line ${i}\n`);

    const lines = buffer.lines();
    expect(lines.at(-1)).toBe("line 49");
    expect(lines).toHaveLength(50);
  });

  it("drops the oldest lines once the line cap is reached", () => {
    const buffer = createStderrBuffer(8192, 3);
    for (const line of ["a", "b", "c", "d", "e"]) buffer.push(`${line}\n`);

    expect(buffer.lines()).toEqual(["c", "d", "e"]);
  });

  it("enforces the byte cap even when the line cap is not reached", () => {
    const buffer = createStderrBuffer(20, 100);
    buffer.push("0123456789\n");
    buffer.push("abcdefghij\n");

    expect(buffer.lines()).toEqual(["abcdefghij"]);
  });

  it("splits a chunk containing several lines and ignores blank ones", () => {
    const buffer = createStderrBuffer();
    buffer.push("first\r\n\r\nsecond\n");

    expect(buffer.lines()).toEqual(["first", "second"]);
  });

  it("returns a copy so callers cannot mutate the retained tail", () => {
    const buffer = createStderrBuffer();
    buffer.push("only\n");
    buffer.lines().push("injected");

    expect(buffer.lines()).toEqual(["only"]);
    expect(buffer.text()).toBe("only");
  });
});
