/**
 * GitWorktreeEnvironment tests.
 *
 * These tests create real git repos and worktrees.
 * They skip when git is not available.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { GitWorktreeEnvironment } from "../git-worktree-environment.js";

function isCommandAvailable(cmd: string): boolean {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [cmd], {
      stdio: "pipe",
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

const GIT_AVAILABLE = isCommandAvailable("git");
const describeIfGit = GIT_AVAILABLE ? describe : describe.skip;

describeIfGit("GitWorktreeEnvironment", () => {
  let env: GitWorktreeEnvironment;
  let repoDir: string;

  function setupRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "git-worktree-env-"));
    execFileSync("git", ["init"], { cwd: dir, stdio: "pipe" });
    execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: dir, stdio: "pipe" });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: dir, stdio: "pipe" });
    writeFileSync(join(dir, "README.md"), "# Test\n");
    execFileSync("git", ["add", "."], { cwd: dir, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "pipe" });
    return dir;
  }

  beforeAll(() => {
    env = new GitWorktreeEnvironment();
    repoDir = setupRepo();
  });

  afterAll(() => {
    if (existsSync(repoDir)) rmSync(repoDir, { recursive: true, force: true });
  });

  it("should have kind 'git-worktree'", () => {
    expect(env.kind).toBe("git-worktree");
  });

  it("should create a session with worktree", async () => {
    const session = await env.createSession({
      workspaceId: "ws-1",
      runId: "run-1",
      agentId: "agent-1",
      environmentKind: "git-worktree",
      workingDirectory: repoDir,
    });

    expect(session.id).toBeDefined();
    expect(session.environmentKind).toBe("git-worktree");
    expect(session.state).toBe("ready");
    expect(session.workingDirectory).toBeTruthy();
    expect(session.workingDirectory).not.toBe(repoDir);
    expect(existsSync(session.workingDirectory!)).toBe(true);

    // Cleanup
    await env.dispose(session.id);
  });

  it("should reject non-existent repo path", async () => {
    await expect(
      env.createSession({
        workspaceId: "ws-1",
        runId: "run-2",
        agentId: "agent-1",
        environmentKind: "git-worktree",
        workingDirectory: "/non/existent/path",
      }),
    ).rejects.toThrow("does not exist");
  });

  it("should get session by id", async () => {
    const session = await env.createSession({
      workspaceId: "ws-1",
      runId: "run-3",
      agentId: "agent-1",
      environmentKind: "git-worktree",
      workingDirectory: repoDir,
    });

    const found = await env.getSession(session.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(session.id);

    await env.dispose(session.id);
  });

  it("should return null for non-existent session", async () => {
    const found = await env.getSession("non-existent");
    expect(found).toBeNull();
  });

  it("should execute git-status action", async () => {
    const session = await env.createSession({
      workspaceId: "ws-1",
      runId: "run-4",
      agentId: "agent-1",
      environmentKind: "git-worktree",
      workingDirectory: repoDir,
    });

    const result = await env.executeAction(session.id, { kind: "git-status" });
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    await env.dispose(session.id);
  });

  it("should execute shell command", async () => {
    const session = await env.createSession({
      workspaceId: "ws-1",
      runId: "run-5",
      agentId: "agent-1",
      environmentKind: "git-worktree",
      workingDirectory: repoDir,
    });

    const result = await env.executeCommand!(session.id, "echo hello");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello");

    await env.dispose(session.id);
  });

  it("should write and read files", async () => {
    const session = await env.createSession({
      workspaceId: "ws-1",
      runId: "run-6",
      agentId: "agent-1",
      environmentKind: "git-worktree",
      workingDirectory: repoDir,
    });

    await env.writeFile(session.id, "test.txt", "hello world");
    const result = await env.readFile(session.id, "test.txt");
    expect(result.content).toBe("hello world");

    await env.dispose(session.id);
  });

  it("should prevent path traversal", async () => {
    const session = await env.createSession({
      workspaceId: "ws-1",
      runId: "run-7",
      agentId: "agent-1",
      environmentKind: "git-worktree",
      workingDirectory: repoDir,
    });

    await expect(env.readFile(session.id, "../../../etc/passwd")).rejects.toThrow(
      "Path traversal",
    );

    await env.dispose(session.id);
  });

  it("should collect artifacts after changes", async () => {
    const session = await env.createSession({
      workspaceId: "ws-1",
      runId: "run-8",
      agentId: "agent-1",
      environmentKind: "git-worktree",
      workingDirectory: repoDir,
    });

    await env.writeFile(session.id, "new-file.txt", "new content");
    const artifacts = await env.collectArtifacts(session.id);
    expect(artifacts.length).toBeGreaterThan(0);
    expect(artifacts.some((a) => a.kind === "changed-files")).toBe(true);

    await env.dispose(session.id);
  });

  it("should dispose session and cleanup worktree", async () => {
    const session = await env.createSession({
      workspaceId: "ws-1",
      runId: "run-9",
      agentId: "agent-1",
      environmentKind: "git-worktree",
      workingDirectory: repoDir,
    });

    const worktreePath = session.workingDirectory!;
    expect(existsSync(worktreePath)).toBe(true);

    await env.dispose(session.id);

    const found = await env.getSession(session.id);
    expect(found).toBeNull();
  });

  it("commits work to the agent branch so it survives disposal", async () => {
    const session = await env.createSession({
      workspaceId: "ws-1",
      runId: "run-deliver",
      agentId: "agent-1",
      environmentKind: "git-worktree",
      workingDirectory: repoDir,
    });
    const worktreePath = session.workingDirectory!;
    writeFileSync(join(worktreePath, "feature.txt"), "delivered\n");

    const result = await env.commitChanges(session.id, "deliver feature");

    expect(result.committed).toBe(true);
    expect(result.branch).toBe("agent/run-deli");
    expect(result.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(result.files).toContain("feature.txt");

    await env.dispose(session.id);

    // The worktree directory is gone, but the branch and its commit remain.
    expect(existsSync(worktreePath)).toBe(false);
    const log = execFileSync("git", ["log", "--oneline", "agent/run-deli"], {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(log).toContain("deliver feature");
    const show = execFileSync("git", ["show", "--stat", "agent/run-deli"], {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(show).toContain("feature.txt");
  });

  it("reports nothing to commit when the agent made no changes", async () => {
    const session = await env.createSession({
      workspaceId: "ws-1",
      runId: "run-empty",
      agentId: "agent-1",
      environmentKind: "git-worktree",
      workingDirectory: repoDir,
    });

    const result = await env.commitChanges(session.id, "noop");

    expect(result.committed).toBe(false);
    expect(result.files).toEqual([]);
    expect(result.reason).toBe("No changes to commit");
    await env.dispose(session.id);
  });

  it("reports work the agent already committed itself", async () => {
    const session = await env.createSession({
      workspaceId: "ws-1",
      runId: "run-selfcommit",
      agentId: "agent-1",
      environmentKind: "git-worktree",
      workingDirectory: repoDir,
    });
    const worktreePath = session.workingDirectory!;
    writeFileSync(join(worktreePath, "self.txt"), "agent authored\n");
    execFileSync("git", ["add", "-A"], { cwd: worktreePath, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", "agent commit"], { cwd: worktreePath, stdio: "pipe" });

    const result = await env.commitChanges(session.id, "jarvis receipt");

    // A clean worktree must not hide the branch's existing commits.
    expect(result.committed).toBe(true);
    expect(result.files).toContain("self.txt");
    await env.dispose(session.id);
  });

  it("keeps runtime bookkeeping out of the deliverable", async () => {
    const session = await env.createSession({
      workspaceId: "ws-1",
      runId: "run-runtime-dir",
      agentId: "agent-1",
      environmentKind: "git-worktree",
      workingDirectory: repoDir,
    });
    const worktreePath = session.workingDirectory!;
    writeFileSync(join(worktreePath, "real.txt"), "deliverable\n");

    const result = await env.commitChanges(session.id, "deliver");

    expect(result.committed).toBe(true);
    expect(result.files).toContain("real.txt");
    // .jarvis/ holds worktrees and logs; it is not part of the change set.
    expect(result.files).not.toContain(".jarvis/");
    await env.dispose(session.id);
  });

  it("resumes an existing agent branch instead of forking a new one", async () => {
    const request = {
      workspaceId: "ws-1",
      runId: "run-retry",
      agentId: "agent-1",
      environmentKind: "git-worktree",
      workingDirectory: repoDir,
    };

    const first = await env.createSession(request);
    writeFileSync(join(first.workingDirectory!, "first.txt"), "first attempt\n");
    const firstCommit = await env.commitChanges(first.id, "first attempt");
    expect(firstCommit.committed).toBe(true);
    await env.dispose(first.id);

    // Simulate a crash after commit but before the run was recorded as done:
    // the same run id is dispatched again.
    const retry = await env.createSession(request);
    expect(retry.workingDirectory).not.toBeNull();

    // Work from the first attempt must still be present, and the retry must
    // resolve against the original base — not a commit made on top of it.
    const resumedFiles = await env.collectArtifacts(retry.id);
    expect(JSON.stringify(resumedFiles)).not.toContain("first.txt");

    writeFileSync(join(retry.workingDirectory!, "second.txt"), "second attempt\n");
    const secondCommit = await env.commitChanges(retry.id, "second attempt");
    expect(secondCommit.committed).toBe(true);
    expect(secondCommit.files).toEqual(expect.arrayContaining(["first.txt", "second.txt"]));
    expect(secondCommit.branch).toBe(firstCommit.branch);

    await env.dispose(retry.id);
  });
});
