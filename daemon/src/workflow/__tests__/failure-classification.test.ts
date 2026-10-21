import { describe, it, expect } from "vitest";
import { classifyFailure, classifyVerificationFailure } from "../failure-classification.js";

describe("classifyFailure", () => {
  it("treats setup problems as infrastructure", () => {
    for (const error of [
      "acpx not found. Install it with: npm install acpx",
      "repoPath is required but was not provided",
      "git worktree add failed: branch already exists",
      "Directory does not exist: /nope",
      "Working directory is within a blocked system path: C:\\Windows",
    ]) {
      expect(classifyFailure({ error })).toBe("infra");
    }
  });

  it("treats transport and provider capacity problems as infrastructure", () => {
    for (const error of [
      "spawn npx ENOENT",
      "Process timed out after 300000ms",
      "socket hang up",
      "HTTP 429 Too Many Requests",
      "insufficient balance",
      "ECONNREFUSED 127.0.0.1:8789",
    ]) {
      expect(classifyFailure({ error })).toBe("infra");
    }
  });

  it("treats an ordinary task failure as the agent's", () => {
    for (const error of [
      "Verification failed: test-command",
      "The agent edited a file outside allowed paths",
      "ACP turn produced no output and reported no error",
    ]) {
      expect(classifyFailure({ error })).toBe("agent");
    }
  });

  it("never excuses an unknown error as infrastructure", () => {
    expect(classifyFailure({ error: "something nobody has classified" })).toBe("agent");
    expect(classifyFailure({ error: "" })).toBe("agent");
    expect(classifyFailure({})).toBe("agent");
  });
});

describe("classifyVerificationFailure", () => {
  it("marks a check that could not run as infrastructure", () => {
    expect(classifyVerificationFailure(["sh: vitest: command not found"])).toBe("infra");
    expect(classifyVerificationFailure(["Error: Cannot find module './x.js'"])).toBe("infra");
  });

  it("marks a real failing assertion as the agent's failure", () => {
    expect(classifyVerificationFailure(["expected 2 to equal 3"])).toBe("agent");
  });
});
