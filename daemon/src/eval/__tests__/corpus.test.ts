import { describe, it, expect } from "vitest";
import { parseCorpus } from "../corpus.js";

const validTask = {
  id: "write-file",
  title: "Write a file",
  prompt: "Create OUT.md",
  checks: [{ type: "file-exists" as const, path: "OUT.md" }],
};

describe("parseCorpus", () => {
  it("accepts a minimal valid corpus and applies defaults", () => {
    const corpus = parseCorpus({ name: "test", tasks: [validTask] });
    expect(corpus.attempts).toBe(3);
    expect(corpus.tasks[0].files).toEqual({});
    expect(corpus.tasks[0].tags).toEqual([]);
    expect(corpus.tasks[0].timeoutMs).toBe(180_000);
  });

  it("rejects a task nobody can judge", () => {
    expect(() =>
      parseCorpus({ name: "test", tasks: [{ ...validTask, checks: [] }] }),
    ).toThrow(/at least 1|at least one/i);
  });

  it("rejects duplicate task ids", () => {
    expect(() => parseCorpus({ name: "test", tasks: [validTask, validTask] })).toThrow(/duplicate task id/);
  });

  it("rejects non-kebab-case ids", () => {
    expect(() => parseCorpus({ name: "test", tasks: [{ ...validTask, id: "Write_File" }] })).toThrow(/kebab/i);
  });

  it("rejects seed files that traverse upward", () => {
    expect(() =>
      parseCorpus({
        name: "test",
        tasks: [{ ...validTask, files: { "../escape.txt": "x" } }],
      }),
    ).toThrow(/relative|traverse/i);
  });

  it("rejects k above the cap", () => {
    expect(() => parseCorpus({ name: "test", attempts: 99, tasks: [validTask] })).toThrow();
  });

  it("names the offending field in the error", () => {
    expect(() => parseCorpus({ name: "test", tasks: [{ ...validTask, prompt: "" }] })).toThrow(/prompt/);
  });
});
