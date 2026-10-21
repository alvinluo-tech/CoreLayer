import { describe, it, expect } from "vitest";
import {
  verifyPathPolicy,
  verifyArtifactPresence,
  runVerification,
} from "../verification.js";

describe("verifyPathPolicy", () => {
  it("should pass when no policy is configured", () => {
    const result = verifyPathPolicy(["file.ts"]);
    expect(result.passed).toBe(true);
    expect(result.checkName).toBe("path-policy");
  });

  it("should pass when all files are within allowed paths", () => {
    const result = verifyPathPolicy(
      ["src/index.ts", "src/utils.ts"],
      ["src/**"],
    );
    expect(result.passed).toBe(true);
  });

  it("should fail when files are outside allowed paths", () => {
    const result = verifyPathPolicy(
      ["src/index.ts", "config/secret.json"],
      ["src/**"],
    );
    expect(result.passed).toBe(false);
    expect(result.metadata?.violations).toHaveLength(1);
  });

  it("should fail when files match denied paths", () => {
    const result = verifyPathPolicy(
      ["src/index.ts", ".env"],
      undefined,
      [".env", ".env.*"],
    );
    expect(result.passed).toBe(false);
    expect(result.metadata?.violations).toHaveLength(1);
  });

  it("should compare Windows paths against forward-slash patterns", () => {
    // Git reports paths with the platform separator. A `src/**` policy that
    // only understands forward slashes rejects every Windows run — and, worse,
    // passes every backslash path through a deny rule it never matched.
    const allowed = verifyPathPolicy(["src\\parser\\index.ts"], ["src/parser/**"]);
    expect(allowed.passed).toBe(true);

    const denied = verifyPathPolicy(["src\\secret\\.env"], undefined, ["src/secret/**"]);
    expect(denied.passed).toBe(false);
  });

  it("should ignore a git status prefix on a changed-file entry", () => {
    // `changed_files` is produced both as bare paths and as `git status`
    // porcelain lines. Reading "M src/a.ts" as a path rejects every file in a
    // scoped run.
    expect(verifyPathPolicy(["M src/index.ts"], ["src/**"]).passed).toBe(true);
    expect(verifyPathPolicy(["?? src/new.ts"], ["src/**"]).passed).toBe(true);
    expect(verifyPathPolicy(["R  src/old.ts -> src/new.ts"], ["src/**"]).passed).toBe(true);

    // The prefix must not become a way around the policy.
    expect(verifyPathPolicy(["M config/secret.json"], ["src/**"]).passed).toBe(false);
    expect(verifyPathPolicy(["R  src/a.ts -> config/b.json"], ["src/**"]).passed).toBe(false);
  });

  it("should pass with empty changed files", () => {
    const result = verifyPathPolicy([], ["src/**"]);
    expect(result.passed).toBe(true);
  });
});

describe("verifyArtifactPresence", () => {
  it("should pass when all required artifacts are present", () => {
    const result = verifyArtifactPresence(
      [{ type: "diff" }, { type: "final_summary" }],
      ["diff", "final_summary"],
    );
    expect(result.passed).toBe(true);
  });

  it("should fail when required artifacts are missing", () => {
    const result = verifyArtifactPresence(
      [{ type: "diff" }],
      ["diff", "final_summary", "test_report"],
    );
    expect(result.passed).toBe(false);
    expect(result.metadata?.missing).toEqual(["final_summary", "test_report"]);
  });

  it("should pass with no required types", () => {
    const result = verifyArtifactPresence([], []);
    expect(result.passed).toBe(true);
  });
});

describe("runVerification", () => {
  it("should run path policy check", async () => {
    const report = await runVerification("run-1", {
      changedFiles: ["src/index.ts"],
      allowedPaths: ["src/**"],
    });
    expect(report.allPassed).toBe(true);
    expect(report.results).toHaveLength(1);
    expect(report.results[0].checkName).toBe("path-policy");
  });

  it("should run artifact presence check", async () => {
    const report = await runVerification("run-1", {
      artifacts: [{ type: "diff" }],
      requiredArtifactTypes: ["diff", "final_summary"],
    });
    expect(report.allPassed).toBe(false);
    expect(report.results).toHaveLength(1);
    expect(report.results[0].checkName).toBe("artifact-presence");
  });

  it("should run multiple checks", async () => {
    const report = await runVerification("run-1", {
      changedFiles: ["src/index.ts"],
      allowedPaths: ["src/**"],
      artifacts: [{ type: "diff" }],
      requiredArtifactTypes: ["diff"],
    });
    expect(report.allPassed).toBe(true);
    expect(report.results).toHaveLength(2);
  });

  it("should aggregate results correctly", async () => {
    const report = await runVerification("run-1", {
      changedFiles: ["etc/passwd"],
      allowedPaths: ["src/**"],
      artifacts: [{ type: "diff" }],
      requiredArtifactTypes: ["diff", "final_summary"],
    });
    expect(report.allPassed).toBe(false);
    expect(report.results.filter((r) => !r.passed)).toHaveLength(2);
  });
});
