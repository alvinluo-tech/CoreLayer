/**
 * Unit tests for worktree policy validation.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  validateWorktreePath,
  configureWorktreePolicy,
  getWorktreePolicyConfig,
} from "../worktree-policy.js";

// Mock audit log to avoid DB dependency
vi.mock("../../persistence/audit-log.js", () => ({
  logAuditEntry: vi.fn().mockResolvedValue(undefined),
}));

describe("worktree-policy", () => {
  const testDir = join(tmpdir(), "jarvis-worktree-test-" + Date.now());

  beforeEach(() => {
    configureWorktreePolicy({ allowedBaseDirs: [], requireWorktreePath: false });
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("rejects when repoPath is undefined", async () => {
    const result = await validateWorktreePath(undefined, undefined);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("repoPath is required");
  });

  it("rejects when path does not exist", async () => {
    const result = await validateWorktreePath("/nonexistent/path", undefined);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("does not exist");
  });

  it("rejects when path is a file, not a directory", async () => {
    const filePath = join(testDir, "file.txt");
    const { writeFileSync } = await import("fs");
    writeFileSync(filePath, "test");
    const result = await validateWorktreePath(filePath, undefined);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not a directory");
  });

  it("allows valid directory path", async () => {
    const result = await validateWorktreePath(testDir, undefined);
    expect(result.allowed).toBe(true);
    expect(result.worktreePath).toBe(testDir);
  });

  it("allows worktreePath when provided", async () => {
    const result = await validateWorktreePath("/some/repo", testDir);
    expect(result.allowed).toBe(true);
    expect(result.worktreePath).toBe(testDir);
  });

  it("rejects path outside allowed base dirs", async () => {
    const outsideDir = join(tmpdir(), "definitely-not-allowed-" + Date.now());
    configureWorktreePolicy({ allowedBaseDirs: [outsideDir] });
    const result = await validateWorktreePath(testDir, undefined);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not within allowed directories");
  });

  it("allows path within allowed base dirs", async () => {
    configureWorktreePolicy({ allowedBaseDirs: [tmpdir()] });
    const result = await validateWorktreePath(testDir, undefined);
    expect(result.allowed).toBe(true);
  });

  it("config returns current settings", () => {
    configureWorktreePolicy({ requireWorktreePath: true, allowedBaseDirs: ["/test"] });
    const config = getWorktreePolicyConfig();
    expect(config.requireWorktreePath).toBe(true);
    expect(config.allowedBaseDirs).toEqual(["/test"]);
  });
});
