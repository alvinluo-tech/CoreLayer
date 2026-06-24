import { describe, it, expect } from "vitest";
import { isStatusArtifact, cleanupLegacyStatusArtifacts } from "../artifact-cleanup.js";

describe("isStatusArtifact", () => {
  it("should detect final_summary pattern", () => {
    const result = isStatusArtifact({
      type: "report",
      title: "final_summary artifact",
      content: "Task completed successfully",
    });
    expect(result.isStatus).toBe(true);
    expect(result.reason).toContain("final_summary");
  });

  it("should detect error pattern", () => {
    const result = isStatusArtifact({
      type: "report",
      title: "error artifact",
      content: "Something went wrong",
    });
    expect(result.isStatus).toBe(true);
    expect(result.reason).toContain("error");
  });

  it("should detect permission prompt pattern", () => {
    const result = isStatusArtifact({
      type: "report",
      title: "output",
      content: "Do you want to proceed? [y/N]",
    });
    expect(result.isStatus).toBe(true);
    expect(result.reason).toContain("permission");
  });

  it("should not flag deliverable artifacts", () => {
    const result = isStatusArtifact({
      type: "file",
      title: "changed_files artifact",
      content: '["src/index.ts", "src/utils.ts"]',
    });
    expect(result.isStatus).toBe(false);
  });

  it("should not flag test reports", () => {
    const result = isStatusArtifact({
      type: "report",
      title: "test_report artifact",
      content: "All 42 tests passed",
    });
    expect(result.isStatus).toBe(false);
  });
});

describe("cleanupLegacyStatusArtifacts", () => {
  it("should default to dry-run", async () => {
    const result = await cleanupLegacyStatusArtifacts({ dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.deleted).toBe(0);
  });

  it("should return empty candidates without workspace context", async () => {
    const result = await cleanupLegacyStatusArtifacts({ dryRun: false });
    expect(result.candidates).toEqual([]);
    expect(result.deleted).toBe(0);
  });
});
