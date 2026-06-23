import { describe, it, expect } from "vitest";
import {
  detectPermissionBlock,
  createApprovalFromBlock,
} from "../permission-block-handler.js";

describe("detectPermissionBlock", () => {
  it("should detect Claude Code permission prompt", () => {
    const result = detectPermissionBlock("claude-code", "Do you want to proceed? [y/N]");
    expect(result.detected).toBe(true);
    expect(result.risk).toBe("medium");
  });

  it("should detect Claude Code tool permission", () => {
    const result = detectPermissionBlock("claude-code", "Allow Bash to run 'npm install'?");
    expect(result.detected).toBe(true);
  });

  it("should detect generic interactive prompt", () => {
    const result = detectPermissionBlock("unknown-adapter", "Continue? [Y/n]");
    expect(result.detected).toBe(true);
    expect(result.risk).toBe("medium");
  });

  it("should not detect normal output", () => {
    const result = detectPermissionBlock("claude-code", "Task completed successfully.");
    expect(result.detected).toBe(false);
  });

  it("should handle empty output", () => {
    const result = detectPermissionBlock("claude-code", "");
    expect(result.detected).toBe(false);
  });
});

describe("createApprovalFromBlock", () => {
  it("should create approval request from detection", () => {
    const detection = detectPermissionBlock("claude-code", "Allow Bash to run 'rm'?");
    const approval = createApprovalFromBlock(detection, "run-1");

    expect(approval.runId).toBe("run-1");
    expect(approval.risk).toBe("medium");
    expect(approval.source).toBe("claude-code");
  });
});
