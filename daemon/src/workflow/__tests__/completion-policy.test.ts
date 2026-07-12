import { describe, expect, it } from "vitest";
import { parseCompletionPolicy } from "../completion-policy.js";

describe("parseCompletionPolicy", () => {
  it("compiles enforceable criteria and preserves prose for manual review", () => {
    expect(parseCompletionPolicy([
      "test: pnpm test",
      "artifact: test_report",
      "allow-path: src/**",
      "The UI looks correct",
    ])).toEqual({
      testCommands: ["pnpm test"],
      requiredArtifactTypes: ["test_report"],
      allowedPaths: ["src/**"],
      manualCriteria: ["The UI looks correct"],
    });
  });

  it("uses an empty policy when no criteria are configured", () => {
    expect(parseCompletionPolicy([])).toEqual({
      testCommands: [],
      requiredArtifactTypes: [],
      allowedPaths: [],
      manualCriteria: [],
    });
  });
});
