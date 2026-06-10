import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockExecFileSync, mockRequestShellExec } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
  mockRequestShellExec: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: mockExecFileSync,
}));

vi.mock("../os-capability-broker.js", () => ({
  getCapabilityBroker: vi.fn().mockReturnValue({
    requestShellExec: mockRequestShellExec,
  }),
}));

const { allowGitRoot, execGit } = await import("./git-command-adapter.js");

describe("git-command-adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecFileSync.mockReturnValue("output");
    mockRequestShellExec.mockResolvedValue({ decision: "allow", reason: "ok" });
  });

  describe("allowGitRoot", () => {
    it("registers a directory as allowed root", async () => {
      allowGitRoot("/workspace/repo");

      const result = await execGit(["status"], "/workspace/repo", "agent-1");

      expect(result).toBe("output");
      expect(mockExecFileSync).toHaveBeenCalledWith("git", ["status"], {
        cwd: "/workspace/repo",
        stdio: "pipe",
        encoding: "utf-8",
      });
    });

    it("normalizes paths with backslashes", async () => {
      allowGitRoot("C:\\Users\\test\\repo");

      const result = await execGit(["log", "--oneline", "-5"], "C:\\Users\\test\\repo", "agent-1");

      expect(result).toBe("output");
    });

    it("deduplicates registered roots", async () => {
      allowGitRoot("/workspace/repo");
      allowGitRoot("/workspace/repo");

      const result = await execGit(["status"], "/workspace/repo", "agent-1");
      expect(result).toBe("output");
    });
  });

  describe("execGit", () => {
    beforeEach(() => {
      allowGitRoot("/workspace/repo");
    });

    it("executes git command successfully", async () => {
      const result = await execGit(["status"], "/workspace/repo", "agent-1");

      expect(result).toBe("output");
      expect(mockExecFileSync).toHaveBeenCalledWith(
        "git",
        ["status"],
        expect.objectContaining({ cwd: "/workspace/repo" }),
      );
    });

    it("throws when args array is empty", async () => {
      await expect(execGit([], "/workspace/repo", "agent-1")).rejects.toThrow(
        "Git command requires at least a subcommand",
      );
    });

    it("throws when cwd is not within any allowed root", async () => {
      await expect(
        execGit(["status"], "/unauthorized/path", "agent-1"),
      ).rejects.toThrow("Git execution denied");
    });

    it("allows cwd that is a subdirectory of an allowed root", async () => {
      const result = await execGit(["diff"], "/workspace/repo/src", "agent-1");

      expect(result).toBe("output");
    });

    it("throws when permission is denied by capability broker", async () => {
      mockRequestShellExec.mockResolvedValue({
        decision: "deny",
        reason: "command not allowed",
      });

      await expect(
        execGit(["rm", "-rf", "."], "/workspace/repo", "agent-1"),
      ).rejects.toThrow("Permission denied");
    });

    it("throws when approval is required", async () => {
      mockRequestShellExec.mockResolvedValue({
        decision: "approval_required",
        reason: "needs user approval",
      });

      await expect(
        execGit(["push"], "/workspace/repo", "agent-1"),
      ).rejects.toThrow("requires approval");
    });

    it("passes opts to capability broker", async () => {
      await execGit(["commit", "-m", "test"], "/workspace/repo", "agent-1", {
        agentRunId: "run-1",
        projectId: "proj-1",
        reason: "commit changes",
      });

      expect(mockRequestShellExec).toHaveBeenCalledWith(
        "agent-1",
        "git commit -m test",
        expect.objectContaining({
          reason: "commit changes",
          agentRunId: "run-1",
          projectId: "proj-1",
        }),
      );
    });

    it("uses default reason when opts.reason is not provided", async () => {
      await execGit(["pull"], "/workspace/repo", "agent-1");

      expect(mockRequestShellExec).toHaveBeenCalledWith(
        "agent-1",
        "git pull",
        expect.objectContaining({
          reason: "Git operation: pull",
        }),
      );
    });

    it("returns stdout output from git", async () => {
      mockExecFileSync.mockReturnValue("On branch main\nnothing to commit");

      const result = await execGit(["status", "--short"], "/workspace/repo", "agent-1");

      expect(result).toBe("On branch main\nnothing to commit");
    });

    it("handles multi-argument git commands", async () => {
      await execGit(["log", "--oneline", "-10", "--graph"], "/workspace/repo", "agent-1");

      expect(mockExecFileSync).toHaveBeenCalledWith(
        "git",
        ["log", "--oneline", "-10", "--graph"],
        expect.anything(),
      );
    });
  });
});
