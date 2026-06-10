import { describe, it, expect, beforeEach, vi } from "vitest";
import { join } from "node:path";

const mockExecGit = vi.hoisted(() => vi.fn());
const mockAllowGitRoot = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockMkdirSync = vi.hoisted(() => vi.fn());

vi.mock("node:fs", () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
}));

vi.mock("../capabilities/adapters/git-command-adapter.js", () => ({
  execGit: (...args: unknown[]) => mockExecGit(...args),
  allowGitRoot: (...args: unknown[]) => mockAllowGitRoot(...args),
}));

const {
  createProjectWorkspace,
  createAgentRunWorkspace,
  getChangedFiles,
  completeWorkspace,
  removeWorkspace,
  detectConflicts,
  getProjectWorkspaces,
  getAgentRunWorkspace,
} = await import("./manager.js");

/** Use unique project IDs per test to avoid shared Map state. */
let testCounter = 0;

describe("WorktreeManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testCounter++;
    mockExistsSync.mockReturnValue(true);
    mockMkdirSync.mockReturnValue(undefined);
    mockExecGit.mockResolvedValue("");
  });

  describe("createProjectWorkspace", () => {
    it("creates a workspace with default branch", () => {
      const ws = createProjectWorkspace({
        projectId: `proj-create-${testCounter}`,
        repoPath: "/tmp/repo",
      });

      expect(ws.id).toBeDefined();
      expect(ws.projectId).toBe(`proj-create-${testCounter}`);
      expect(ws.repoPath).toBe("/tmp/repo");
      expect(ws.defaultBranch).toBe("main");
      // Path separator is platform-dependent; check the key segment
      expect(ws.workspaceRoot).toContain(".jarvis");
      expect(ws.workspaceRoot).toContain("worktrees");
      expect(ws.createdAt).toBeDefined();
    });

    it("uses custom default branch when provided", () => {
      const ws = createProjectWorkspace({
        projectId: `proj-branch-${testCounter}`,
        repoPath: "/tmp/repo",
        defaultBranch: "develop",
      });

      expect(ws.defaultBranch).toBe("develop");
    });

    it("registers git roots for repo and workspace", () => {
      createProjectWorkspace({
        projectId: `proj-roots-${testCounter}`,
        repoPath: "/tmp/repo",
      });

      expect(mockAllowGitRoot).toHaveBeenCalledTimes(2);
      expect(mockAllowGitRoot).toHaveBeenCalledWith("/tmp/repo");
    });

    it("throws if repo path does not exist", () => {
      mockExistsSync.mockReturnValue(false);

      expect(() =>
        createProjectWorkspace({
          projectId: `proj-noexist-${testCounter}`,
          repoPath: "/nonexistent",
        }),
      ).toThrow("Repository path does not exist");
    });

    it("creates workspace root directory with recursive option", () => {
      createProjectWorkspace({
        projectId: `proj-mkdir-${testCounter}`,
        repoPath: "/tmp/repo",
      });

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining(".jarvis"),
        { recursive: true },
      );
    });

    it("workspace root is derived from repoPath", () => {
      const ws = createProjectWorkspace({
        projectId: `proj-derive-${testCounter}`,
        repoPath: "/my/project",
      });

      const expected = join("/my/project", ".jarvis", "worktrees");
      expect(ws.workspaceRoot).toBe(expected);
    });
  });

  describe("createAgentRunWorkspace", () => {
    it("creates an agent run workspace for an existing project", async () => {
      createProjectWorkspace({
        projectId: `proj-ar-${testCounter}`,
        repoPath: "/tmp/repo",
      });

      const ws = await createAgentRunWorkspace({
        agentRunId: `run-create-${testCounter}`,
        projectId: `proj-ar-${testCounter}`,
      });

      expect(ws.id).toBeDefined();
      expect(ws.agentRunId).toBe(`run-create-${testCounter}`);
      expect(ws.projectId).toBe(`proj-ar-${testCounter}`);
      expect(ws.branchName).toContain("agent/");
      expect(ws.status).toBe("active");
      expect(ws.changedFiles).toEqual([]);
      expect(mockExecGit).toHaveBeenCalledTimes(1);
    });

    it("uses custom branch name when provided", async () => {
      createProjectWorkspace({
        projectId: `proj-cbranch-${testCounter}`,
        repoPath: "/tmp/repo",
      });

      const ws = await createAgentRunWorkspace({
        agentRunId: `run-cbranch-${testCounter}`,
        projectId: `proj-cbranch-${testCounter}`,
        branchName: "feature/custom",
      });

      expect(ws.branchName).toBe("feature/custom");
    });

    it("throws if project workspace not found", async () => {
      await expect(
        createAgentRunWorkspace({
          agentRunId: `run-nofind-${testCounter}`,
          projectId: "nonexistent",
        }),
      ).rejects.toThrow("No project workspace found");
    });

    it("falls back to existing branch when -b fails", async () => {
      createProjectWorkspace({
        projectId: `proj-fallback-${testCounter}`,
        repoPath: "/tmp/repo",
      });

      mockExecGit
        .mockRejectedValueOnce(new Error("branch already exists"))
        .mockResolvedValueOnce("");

      const ws = await createAgentRunWorkspace({
        agentRunId: `run-fallback-${testCounter}`,
        projectId: `proj-fallback-${testCounter}`,
      });

      expect(ws.status).toBe("active");
      expect(mockExecGit).toHaveBeenCalledTimes(2);
    });

    it("throws when both worktree creation attempts fail", async () => {
      createProjectWorkspace({
        projectId: `proj-bothfail-${testCounter}`,
        repoPath: "/tmp/repo",
      });

      mockExecGit
        .mockRejectedValueOnce(new Error("fail1"))
        .mockRejectedValueOnce(new Error("fail2"));

      await expect(
        createAgentRunWorkspace({
          agentRunId: `run-bothfail-${testCounter}`,
          projectId: `proj-bothfail-${testCounter}`,
        }),
      ).rejects.toThrow("Failed to create worktree");
    });

    it("agent workspace is retrievable by agentRunId", async () => {
      createProjectWorkspace({
        projectId: `proj-find-${testCounter}`,
        repoPath: "/tmp/repo",
      });

      const created = await createAgentRunWorkspace({
        agentRunId: `run-findme-${testCounter}`,
        projectId: `proj-find-${testCounter}`,
      });

      const found = getAgentRunWorkspace(`run-findme-${testCounter}`);
      expect(found?.id).toBe(created.id);
    });

    it("workspaceRoot is derived from project workspace", async () => {
      const projectWs = createProjectWorkspace({
        projectId: `proj-wsroot-${testCounter}`,
        repoPath: "/tmp/repo",
      });

      const ws = await createAgentRunWorkspace({
        agentRunId: `run-wsroot-${testCounter}`,
        projectId: `proj-wsroot-${testCounter}`,
      });

      expect(ws.worktreePath).toContain(projectWs.workspaceRoot);
    });
  });

  describe("getChangedFiles", () => {
    it("returns files from git diff", async () => {
      createProjectWorkspace({
        projectId: `proj-changed-${testCounter}`,
        repoPath: "/tmp/repo",
      });
      const ws = await createAgentRunWorkspace({
        agentRunId: `run-changed-${testCounter}`,
        projectId: `proj-changed-${testCounter}`,
      });

      mockExecGit.mockResolvedValue("src/a.ts\nsrc/b.ts\n");

      const files = await getChangedFiles(ws.id);
      expect(files).toEqual(["src/a.ts", "src/b.ts"]);
    });

    it("returns empty array when no files changed", async () => {
      createProjectWorkspace({
        projectId: `proj-empty-${testCounter}`,
        repoPath: "/tmp/repo",
      });
      const ws = await createAgentRunWorkspace({
        agentRunId: `run-empty-${testCounter}`,
        projectId: `proj-empty-${testCounter}`,
      });

      mockExecGit.mockResolvedValue("");

      const files = await getChangedFiles(ws.id);
      expect(files).toEqual([]);
    });

    it("throws if workspace not found", async () => {
      await expect(getChangedFiles("nonexistent")).rejects.toThrow(
        "Workspace not found",
      );
    });

    it("returns cached changedFiles on git error", async () => {
      createProjectWorkspace({
        projectId: `proj-cache-${testCounter}`,
        repoPath: "/tmp/repo",
      });
      const ws = await createAgentRunWorkspace({
        agentRunId: `run-cache-${testCounter}`,
        projectId: `proj-cache-${testCounter}`,
      });

      mockExecGit.mockRejectedValueOnce(new Error("git error"));
      const files = await getChangedFiles(ws.id);
      expect(files).toEqual([]); // default empty list
    });
  });

  describe("completeWorkspace", () => {
    it("marks workspace as completed", async () => {
      createProjectWorkspace({
        projectId: `proj-complete-${testCounter}`,
        repoPath: "/tmp/repo",
      });
      const ws = await createAgentRunWorkspace({
        agentRunId: `run-complete-${testCounter}`,
        projectId: `proj-complete-${testCounter}`,
      });

      mockExecGit.mockResolvedValue("file1.ts\n");
      await completeWorkspace(ws.id);

      const updated = getAgentRunWorkspace(`run-complete-${testCounter}`);
      expect(updated?.status).toBe("completed");
      expect(updated?.changedFiles).toEqual(["file1.ts"]);
    });

    it("throws if workspace not found", async () => {
      await expect(completeWorkspace("nonexistent")).rejects.toThrow(
        "Workspace not found",
      );
    });

    it("updates the updatedAt timestamp", async () => {
      createProjectWorkspace({
        projectId: `proj-ts-${testCounter}`,
        repoPath: "/tmp/repo",
      });
      const ws = await createAgentRunWorkspace({
        agentRunId: `run-ts-${testCounter}`,
        projectId: `proj-ts-${testCounter}`,
      });

      const beforeUpdate = ws.updatedAt;
      // Small delay to ensure timestamp differs
      await new Promise((r) => setTimeout(r, 10));

      mockExecGit.mockResolvedValue("");
      await completeWorkspace(ws.id);

      const updated = getAgentRunWorkspace(`run-ts-${testCounter}`);
      expect(updated?.updatedAt).not.toBe(beforeUpdate);
    });
  });

  describe("removeWorkspace", () => {
    it("marks workspace as abandoned and removes worktree", async () => {
      createProjectWorkspace({
        projectId: `proj-remove-${testCounter}`,
        repoPath: "/tmp/repo",
      });
      const ws = await createAgentRunWorkspace({
        agentRunId: `run-remove-${testCounter}`,
        projectId: `proj-remove-${testCounter}`,
      });

      mockExecGit.mockResolvedValue("");
      await removeWorkspace(ws.id);

      const updated = getAgentRunWorkspace(`run-remove-${testCounter}`);
      expect(updated?.status).toBe("abandoned");
    });

    it("still marks abandoned even if git worktree remove fails", async () => {
      createProjectWorkspace({
        projectId: `proj-rmfail-${testCounter}`,
        repoPath: "/tmp/repo",
      });
      const ws = await createAgentRunWorkspace({
        agentRunId: `run-rmfail-${testCounter}`,
        projectId: `proj-rmfail-${testCounter}`,
      });

      mockExecGit.mockRejectedValue(new Error("git error"));
      await removeWorkspace(ws.id);

      const updated = getAgentRunWorkspace(`run-rmfail-${testCounter}`);
      expect(updated?.status).toBe("abandoned");
    });

    it("throws if workspace not found", async () => {
      await expect(removeWorkspace("nonexistent")).rejects.toThrow(
        "Workspace not found",
      );
    });

    it("calls execGit with worktree remove when project exists", async () => {
      createProjectWorkspace({
        projectId: `proj-rmexec-${testCounter}`,
        repoPath: "/tmp/repo",
      });
      const ws = await createAgentRunWorkspace({
        agentRunId: `run-rmexec-${testCounter}`,
        projectId: `proj-rmexec-${testCounter}`,
      });

      mockExecGit.mockResolvedValue("");
      await removeWorkspace(ws.id);

      expect(mockExecGit).toHaveBeenCalledWith(
        expect.arrayContaining(["worktree", "remove"]),
        "/tmp/repo",
        "worktree-manager",
        expect.objectContaining({ agentRunId: `run-rmexec-${testCounter}` }),
      );
    });
  });

  describe("detectConflicts", () => {
    it("returns empty when no active workspaces", async () => {
      createProjectWorkspace({
        projectId: `proj-noconf-${testCounter}`,
        repoPath: "/tmp/repo",
      });

      const conflicts = await detectConflicts(`proj-noconf-${testCounter}`);
      expect(conflicts).toEqual([]);
    });

    it("detects file conflicts between two workspaces", async () => {
      const pid = `proj-conf-${testCounter}`;
      createProjectWorkspace({ projectId: pid, repoPath: "/tmp/repo" });

      const wsA = await createAgentRunWorkspace({
        agentRunId: `run-confA-${testCounter}`,
        projectId: pid,
      });
      const wsB = await createAgentRunWorkspace({
        agentRunId: `run-confB-${testCounter}`,
        projectId: pid,
      });

      // Workspace A has shared.ts + unique-a.ts, Workspace B has shared.ts + unique-b.ts
      // The overlap is just "shared.ts"
      mockExecGit
        .mockResolvedValueOnce("shared.ts\nunique-a.ts\n")  // wsA
        .mockResolvedValueOnce("shared.ts\nunique-b.ts\n"); // wsB

      const conflicts = await detectConflicts(pid);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].filePath).toBe("shared.ts");
      expect(conflicts[0].workspaceA).toBe(wsA.id);
      expect(conflicts[0].workspaceB).toBe(wsB.id);
    });

    it("returns empty when no file overlap", async () => {
      const pid = `proj-noverlap-${testCounter}`;
      createProjectWorkspace({ projectId: pid, repoPath: "/tmp/repo" });

      await createAgentRunWorkspace({
        agentRunId: `run-noverlapA-${testCounter}`,
        projectId: pid,
      });
      await createAgentRunWorkspace({
        agentRunId: `run-noverlapB-${testCounter}`,
        projectId: pid,
      });

      // Workspace A has "a-only.ts", Workspace B has "b-only.ts" — no overlap
      mockExecGit
        .mockResolvedValueOnce("a-only.ts\n")
        .mockResolvedValueOnce("b-only.ts\n");

      const conflicts = await detectConflicts(pid);
      expect(conflicts).toEqual([]);
    });

    it("ignores completed workspaces", async () => {
      const pid = `proj-ignore-${testCounter}`;
      createProjectWorkspace({ projectId: pid, repoPath: "/tmp/repo" });

      const wsA = await createAgentRunWorkspace({
        agentRunId: `run-ignoreA-${testCounter}`,
        projectId: pid,
      });
      await createAgentRunWorkspace({
        agentRunId: `run-ignoreB-${testCounter}`,
        projectId: pid,
      });

      // Complete workspace A (marks status = "completed")
      mockExecGit.mockResolvedValue("file.ts\n");
      await completeWorkspace(wsA.id);

      // detectConflicts should only consider active workspaces
      const conflicts = await detectConflicts(pid);
      expect(conflicts).toEqual([]);
    });

    it("detects multiple conflicts across workspaces", async () => {
      const pid = `proj-multi-${testCounter}`;
      createProjectWorkspace({ projectId: pid, repoPath: "/tmp/repo" });

      await createAgentRunWorkspace({
        agentRunId: `run-multiA-${testCounter}`,
        projectId: pid,
      });
      await createAgentRunWorkspace({
        agentRunId: `run-multiB-${testCounter}`,
        projectId: pid,
      });

      mockExecGit.mockResolvedValue("a.ts\nb.ts\n");
      const conflicts = await detectConflicts(pid);

      expect(conflicts).toHaveLength(2);
      const filePaths = conflicts.map((c) => c.filePath).sort();
      expect(filePaths).toEqual(["a.ts", "b.ts"]);
    });
  });

  describe("getProjectWorkspaces", () => {
    it("returns all workspaces for a project", async () => {
      createProjectWorkspace({
        projectId: `proj-getall-${testCounter}`,
        repoPath: "/tmp/repo",
      });

      await createAgentRunWorkspace({
        agentRunId: `run-getall1-${testCounter}`,
        projectId: `proj-getall-${testCounter}`,
      });
      await createAgentRunWorkspace({
        agentRunId: `run-getall2-${testCounter}`,
        projectId: `proj-getall-${testCounter}`,
      });

      const workspaces = getProjectWorkspaces(`proj-getall-${testCounter}`);
      expect(workspaces).toHaveLength(2);
    });

    it("returns empty array for project with no workspaces", () => {
      const workspaces = getProjectWorkspaces("nonexistent");
      expect(workspaces).toEqual([]);
    });

    it("does not mix workspaces from different projects", async () => {
      createProjectWorkspace({
        projectId: `proj-mixA-${testCounter}`,
        repoPath: "/tmp/repo1",
      });
      createProjectWorkspace({
        projectId: `proj-mixB-${testCounter}`,
        repoPath: "/tmp/repo2",
      });

      await createAgentRunWorkspace({
        agentRunId: `run-mixA-${testCounter}`,
        projectId: `proj-mixA-${testCounter}`,
      });

      expect(getProjectWorkspaces(`proj-mixA-${testCounter}`)).toHaveLength(1);
      expect(getProjectWorkspaces(`proj-mixB-${testCounter}`)).toHaveLength(0);
    });
  });

  describe("getAgentRunWorkspace", () => {
    it("returns workspace by agent run id", async () => {
      createProjectWorkspace({
        projectId: `proj-findws-${testCounter}`,
        repoPath: "/tmp/repo",
      });

      await createAgentRunWorkspace({
        agentRunId: `run-findme-${testCounter}`,
        projectId: `proj-findws-${testCounter}`,
      });

      const found = getAgentRunWorkspace(`run-findme-${testCounter}`);
      expect(found).toBeDefined();
      expect(found?.agentRunId).toBe(`run-findme-${testCounter}`);
    });

    it("returns undefined for unknown agent run id", () => {
      expect(getAgentRunWorkspace("nonexistent")).toBeUndefined();
    });
  });
});
