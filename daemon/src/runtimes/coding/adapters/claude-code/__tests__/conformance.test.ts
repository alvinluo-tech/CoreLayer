/**
 * Claude Code Conformance Harness
 *
 * Tests that prove Claude Code adapter behavior.
 * All tests skip safely when Claude Code CLI is not installed.
 *
 * Run locally: CLAUDE_CODE_CONFORMANCE=1 npx vitest run conformance
 * CI: tests skip automatically when claude is not on PATH.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ClaudeCodeCliAdapter } from "../cli-adapter.js";

function isCommandAvailable(cmd: string): boolean {
  try {
    execFileSync(
      process.platform === "win32" ? "where" : "which",
      [cmd],
      { stdio: "pipe", timeout: 5_000 },
    );
    return true;
  } catch {
    return false;
  }
}

const CLAUDE_AVAILABLE = isCommandAvailable("claude");
const GIT_AVAILABLE = isCommandAvailable("git");
const CONFORMANCE_ENABLED = process.env.CLAUDE_CODE_CONFORMANCE === "1";

const describeIfClaude = CONFORMANCE_ENABLED && CLAUDE_AVAILABLE ? describe : describe.skip;
const describeIfBoth = CONFORMANCE_ENABLED && CLAUDE_AVAILABLE && GIT_AVAILABLE ? describe : describe.skip;

function removeTempDir(dir: string): void {
  if (!existsSync(dir)) return;
  rmSync(dir, {
    recursive: true,
    force: true,
    maxRetries: process.platform === "win32" ? 10 : 0,
    retryDelay: process.platform === "win32" ? 250 : 0,
  });
}

describe("Claude Code Conformance", () => {
  let adapter: ClaudeCodeCliAdapter;

  beforeAll(() => {
    adapter = new ClaudeCodeCliAdapter();
  });

  describe("Discovery", () => {
    it("should have correct adapter id", () => {
      expect(adapter.id).toBe("claude-code");
    });

    it("should have a display name", () => {
      expect(adapter.displayName).toBeTruthy();
    });

    it("should report availability", async () => {
      const result = await adapter.discover();
      expect(result).toHaveProperty("available");
      expect(result).toHaveProperty("transport");
      expect(result.transport).toBe("cli");
    });

    it("should detect claude CLI presence", async () => {
      const result = await adapter.discover();
      expect(result.available).toBe(CLAUDE_AVAILABLE);
    });
  });

  describeIfClaude("Installed Behavior", () => {
    it("should discover Claude Code as available", async () => {
      const result = await adapter.discover();
      expect(result.available).toBe(true);
    });

    it("should report version when available", async () => {
      const result = await adapter.discover();
      if (result.available) {
        expect(result.version).toBeTruthy();
        expect(typeof result.version).toBe("string");
      }
    });

    it("should reject missing repoPath", async () => {
      const handle = await adapter.startRun({
        repoPath: "",
        taskPrompt: "test",
      });
      expect(handle.status).toBe("failed");
    });
  });

  describeIfBoth("Simple Run", () => {
    let tmpDir: string;

    function setupGitRepo(): string {
      const dir = mkdtempSync(join(tmpdir(), "claude-conformance-"));
      execFileSync("git", ["init"], { cwd: dir, stdio: "pipe" });
      execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: dir, stdio: "pipe" });
      execFileSync("git", ["config", "user.name", "Test"], { cwd: dir, stdio: "pipe" });
      return dir;
    }

    it("should run a simple non-interactive prompt", async () => {
      tmpDir = setupGitRepo();
      try {
        const handle = await adapter.startRun({
          repoPath: tmpDir,
          taskPrompt: "Reply with exactly: CONFORMANCE_OK",
          timeoutMs: 60_000,
        });

        expect(handle.runId).toBeTruthy();
        expect(handle.adapterId).toBe("claude-code");

        let info;
        const deadline = Date.now() + 60_000;
        while (Date.now() < deadline) {
          info = await adapter.getRunStatus(handle.runId);
          if (info.status !== "running" && info.status !== "pending") break;
          await new Promise((r) => setTimeout(r, 1_000));
        }

        expect(info).toBeDefined();
        expect(info!.status).toBe("succeeded");
      } finally {
        removeTempDir(tmpDir);
      }
    }, 90_000);

    it("should collect artifacts after completion", async () => {
      tmpDir = setupGitRepo();
      try {
        const handle = await adapter.startRun({
          repoPath: tmpDir,
          taskPrompt: "Reply with exactly: ARTIFACTS_OK",
          timeoutMs: 60_000,
        });

        let info;
        const deadline = Date.now() + 60_000;
        while (Date.now() < deadline) {
          info = await adapter.getRunStatus(handle.runId);
          if (info.status !== "running" && info.status !== "pending") break;
          await new Promise((r) => setTimeout(r, 1_000));
        }

        expect(info!.status).toBe("succeeded");

        const artifacts = await adapter.collectArtifacts(handle.runId);
        expect(Array.isArray(artifacts)).toBe(true);
      } finally {
        removeTempDir(tmpDir);
      }
    }, 90_000);
  });

  describeIfBoth("Timeout", () => {
    it("should respect timeout", async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "claude-timeout-"));
      execFileSync("git", ["init"], { cwd: tmpDir, stdio: "pipe" });
      execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: tmpDir, stdio: "pipe" });
      execFileSync("git", ["config", "user.name", "Test"], { cwd: tmpDir, stdio: "pipe" });

      try {
        const handle = await adapter.startRun({
          repoPath: tmpDir,
          taskPrompt: "Write a 10000 word essay about every programming language ever created",
          timeoutMs: 5_000,
        });

        let info;
        const deadline = Date.now() + 15_000;
        while (Date.now() < deadline) {
          info = await adapter.getRunStatus(handle.runId);
          if (info.status !== "running" && info.status !== "pending") break;
          await new Promise((r) => setTimeout(r, 500));
        }

        expect(info).toBeDefined();
        expect(["failed", "cancelled", "timed_out"]).toContain(info!.status);
      } finally {
        removeTempDir(tmpDir);
      }
    }, 30_000);
  });

  describeIfBoth("Cancellation", () => {
    it("should cancel a running process", async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "claude-cancel-"));
      execFileSync("git", ["init"], { cwd: tmpDir, stdio: "pipe" });
      execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: tmpDir, stdio: "pipe" });
      execFileSync("git", ["config", "user.name", "Test"], { cwd: tmpDir, stdio: "pipe" });

      try {
        const handle = await adapter.startRun({
          repoPath: tmpDir,
          taskPrompt: "Write a 50000 word essay about the history of computing",
          timeoutMs: 120_000,
        });

        await new Promise((r) => setTimeout(r, 2_000));

        const cancelled = await adapter.cancelRun(handle.runId);
        expect(cancelled).toBe(true);

        await new Promise((r) => setTimeout(r, 1_000));
        const info = await adapter.getRunStatus(handle.runId);
        expect(["cancelled", "failed"]).toContain(info.status);
      } finally {
        removeTempDir(tmpDir);
      }
    }, 30_000);
  });
});
