import { describe, expect, it } from "vitest";
import { evaluateCompletionEvidence } from "../completion-evidence.js";
import type { ExecutorArtifact } from "@jarvis/runtime-protocol";

function artifact(type: string, content: string): ExecutorArtifact {
  return { type, content };
}

describe("evaluateCompletionEvidence", () => {
  it("treats a text summary alone as no evidence", () => {
    // This is exactly the case that produced "completed" tasks with zero work.
    const verdict = evaluateCompletionEvidence([]);
    expect(verdict.complete).toBe(false);
  });

  it("accepts a changed-files artifact", () => {
    const verdict = evaluateCompletionEvidence([
      artifact("changed_files", "src/a.ts\nsrc/b.ts"),
    ]);
    expect(verdict).toEqual({ complete: true, files: ["src/a.ts", "src/b.ts"] });
  });

  it("rejects an empty changed-files artifact", () => {
    const verdict = evaluateCompletionEvidence([artifact("changed_files", "  \n ")]);
    expect(verdict.complete).toBe(false);
  });

  it("accepts a test report as evidence of verification work", () => {
    const verdict = evaluateCompletionEvidence([artifact("test_report", "42 passed")]);
    expect(verdict.complete).toBe(true);
  });

  it("counts files across multiple artifacts", () => {
    const verdict = evaluateCompletionEvidence([
      artifact("changed_files", "a.ts"),
      artifact("generated_file", "b.md"),
    ]);
    expect(verdict.complete).toBe(true);
    expect(verdict.complete && verdict.files).toEqual(["a.ts"]);
  });
});
