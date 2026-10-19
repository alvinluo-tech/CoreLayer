/**
 * GitWorktreeEnvironment — Coding-domain implementation of ExecutionEnvironment.
 *
 * Uses git worktrees for isolated per-run coding workspaces.
 * This is the default coding environment; other domains (research, image, messaging)
 * will have their own implementations.
 */

import type {
  ExecutionEnvironment,
  EnvironmentSessionRequest,
  EnvironmentSession,
  ActionRequest,
  ActionResult,
  CommandResult,
  FileReadResult,
  FileWriteResult,
  Artifact,
  CommitResult,
} from "@jarvis/execution-environment";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execGit, allowGitRoot } from "../../capabilities/adapters/git-command-adapter.js";
import { spawnProcess } from "./process-spawner.js";

/** Runtime directory the environment creates inside the repository. */
const RUNTIME_DIR = ".jarvis";

interface WorktreeSessionData {
  repoPath: string;
  worktreePath: string;
  branchName: string;
  projectWorkspaceId: string;
  /** Commit the branch was created from; the delivery baseline. */
  baseSha: string;
}

/** In-memory session store */
const sessions = new Map<string, { session: EnvironmentSession; data: WorktreeSessionData }>();

export class GitWorktreeEnvironment implements ExecutionEnvironment {
  readonly kind = "git-worktree";

  async createSession(request: EnvironmentSessionRequest): Promise<EnvironmentSession> {
    const envMeta = request.metadata ?? {};
    const repoPath = request.workingDirectory ?? (envMeta.repoPath as string);
    if (!repoPath || !existsSync(repoPath)) {
      throw new Error(`Repository path does not exist: ${repoPath}`);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const branchName = (envMeta.branchName as string) ?? `agent/${request.runId.slice(0, 8)}`;
    const worktreeRoot = join(repoPath, RUNTIME_DIR, "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });

    allowGitRoot(repoPath);
    allowGitRoot(worktreeRoot);

    const worktreePath = join(worktreeRoot, `run-${id.slice(0, 8)}`);

    let baseSha = "";
    try {
      baseSha = (await execGit(["rev-parse", "HEAD"], repoPath, "git-worktree-environment")).trim();
    } catch {
      // A repository without commits cannot provide a baseline; delivery will
      // report no changes rather than invent one.
    }

    // A retried run must continue from its own branch, not fork a second one.
    // Reusing the existing branch also makes re-delivery idempotent: the
    // baseline stays where the first attempt started.
    const branchExists = await this.branchExists(repoPath, branchName);
    try {
      await execGit(
        branchExists
          ? ["worktree", "add", worktreePath, branchName]
          : ["worktree", "add", "-b", branchName, worktreePath, "HEAD"],
        repoPath,
        "git-worktree-environment",
        { agentRunId: request.runId, projectId: request.workspaceId },
      );
      if (branchExists) {
        // Measure the whole branch, including work from earlier attempts,
        // against the commit the branch was originally cut from.
        baseSha = (await execGit(
          ["rev-parse", `${branchName}~1`],
          repoPath,
          "git-worktree-environment",
        )).trim();
      }
    } catch (err) {
      throw new Error(`Failed to create worktree: ${err}`);
    }

    const session: EnvironmentSession = {
      id,
      environmentKind: this.kind,
      state: "ready",
      workingDirectory: worktreePath,
      workspaceId: request.workspaceId,
      runId: request.runId,
      agentId: request.agentId,
      createdAt: now,
    };

    sessions.set(id, {
      session,
      data: { repoPath, worktreePath, branchName, projectWorkspaceId: request.workspaceId, baseSha },
    });

    return session;
  }

  async getSession(sessionId: string): Promise<EnvironmentSession | null> {
    const entry = sessions.get(sessionId);
    return entry?.session ?? null;
  }

  async executeAction(sessionId: string, action: ActionRequest): Promise<ActionResult> {
    const entry = sessions.get(sessionId);
    if (!entry) return { success: false, kind: action.kind, error: "Session not found" };

    if (action.kind === "git-status") {
      return this.runGitCommand(entry.data.worktreePath, ["status", "--porcelain"], action.kind);
    }
    if (action.kind === "git-diff") {
      return this.runGitCommand(entry.data.worktreePath, ["diff", "--name-only", "HEAD"], action.kind);
    }
    if (action.kind === "git-add") {
      const files = (action.parameters?.files as string[]) ?? ["."];
      return this.runGitCommand(entry.data.worktreePath, ["add", ...files], action.kind);
    }
    if (action.kind === "git-commit") {
      const message = (action.parameters?.message as string) ?? "Auto-commit";
      return this.runGitCommand(entry.data.worktreePath, ["commit", "-m", message], action.kind);
    }

    return { success: false, kind: action.kind, error: `Unknown action kind: ${action.kind}` };
  }

  async executeCommand(
    sessionId: string,
    command: string,
    timeoutMs?: number,
  ): Promise<CommandResult> {
    const entry = sessions.get(sessionId);
    if (!entry) throw new Error("Session not found");

    const isWindows = process.platform === "win32";
    const shell = isWindows ? "cmd" : "sh";
    const shellArgs = isWindows ? ["/c", command] : ["-c", command];

    const result = await spawnProcess({
      command: shell,
      args: shellArgs,
      cwd: entry.data.worktreePath,
      timeoutMs: timeoutMs ?? 30_000,
    });

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
    };
  }

  async readFile(sessionId: string, path: string): Promise<FileReadResult> {
    const entry = sessions.get(sessionId);
    if (!entry) throw new Error("Session not found");

    const fullPath = resolve(entry.data.worktreePath, path);
    if (!fullPath.startsWith(entry.data.worktreePath)) {
      throw new Error("Path traversal detected");
    }

    const content = readFileSync(fullPath, "utf-8");
    return { path, content, encoding: "utf-8", size: content.length };
  }

  async writeFile(sessionId: string, path: string, content: string): Promise<FileWriteResult> {
    const entry = sessions.get(sessionId);
    if (!entry) throw new Error("Session not found");

    const fullPath = resolve(entry.data.worktreePath, path);
    if (!fullPath.startsWith(entry.data.worktreePath)) {
      throw new Error("Path traversal detected");
    }

    writeFileSync(fullPath, content, "utf-8");
    return { path, bytesWritten: Buffer.byteLength(content, "utf-8") };
  }

  async collectArtifacts(sessionId: string): Promise<Artifact[]> {
    const entry = sessions.get(sessionId);
    if (!entry) return [];

    const artifacts: Artifact[] = [];
    const now = new Date().toISOString();

    // Collect changed files (tracked + untracked)
    try {
      const statusResult = await execGit(
        ["status", "--porcelain"],
        entry.data.worktreePath,
        "git-worktree-environment",
      );
      const files = statusResult
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => line.slice(3).trim());
      if (files.length > 0) {
        artifacts.push({
          id: crypto.randomUUID(),
          kind: "changed-files",
          content: JSON.stringify(files),
          summary: `${files.length} file(s) changed`,
          metadata: { files },
          createdAt: now,
        });
      }
    } catch {
      // No status available
    }

    // Collect diff content
    try {
      const diff = await execGit(
        ["diff", "HEAD"],
        entry.data.worktreePath,
        "git-worktree-environment",
      );
      if (diff.trim()) {
        artifacts.push({
          id: crypto.randomUUID(),
          kind: "diff",
          content: diff,
          summary: "Uncommitted changes diff",
          createdAt: now,
        });
      }
    } catch {
      // No diff available
    }

    return artifacts;
  }

  async commitChanges(sessionId: string, message: string): Promise<CommitResult> {
    const entry = sessions.get(sessionId);
    if (!entry) return { committed: false, files: [], reason: "Session not found" };

    const { worktreePath, repoPath, branchName, baseSha } = entry.data;
    const context = { agentRunId: entry.session.runId, projectId: entry.data.projectWorkspaceId };

    let files: string[] = [];
    try {
      const status = await execGit(["status", "--porcelain"], worktreePath, "git-worktree-environment", context);
      files = status
        .split(/\r?\n/)
        .filter(Boolean)
        // Keep the porcelain status prefix: it distinguishes renames/deletes,
        // which must not be passed to `git add` as plain paths.
        .map((line) => line.slice(3).trim());
    } catch (err) {
      return {
        committed: false,
        files: [],
        reason: `Unable to read worktree status: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    if (files.length === 0) {
      // The agent may have committed on its own. Uncommitted work is not the
      // only reason a branch can carry a deliverable; commits ahead of the
      // base are equally real and must be reported.
      const ahead = await this.commitsAheadOfBase(worktreePath, baseSha, context);
      if (ahead > 0) {
        let sha: string | undefined;
        try {
          sha = (await execGit(["rev-parse", "HEAD"], worktreePath, "git-worktree-environment", context)).trim();
        } catch {
          // Receipt is best-effort.
        }
        const committedFiles = await this.committedFiles(worktreePath, baseSha, context);
        return {
          committed: true,
          branch: branchName,
          sha,
          files: committedFiles,
        };
      }
      return { committed: false, files: [], reason: "No changes to commit" };
    }

    // Agent identity is local to this repo so commits do not depend on the
    // user's global git config.
    await execGit(["config", "user.name", "Jarvis Agent"], worktreePath, "git-worktree-environment", context);
    await execGit(["config", "user.email", "agent@jarvis.local"], worktreePath, "git-worktree-environment", context);
    await execGit(["add", "-A"], worktreePath, "git-worktree-environment", context);
    // Runtime bookkeeping lives inside the repo but is not part of the
    // deliverable; committing it would pollute every agent branch.
    await this.unstageRuntimeDir(worktreePath, context);

    // Excluding the runtime directory can empty the index entirely (a run that
    // only wrote logs). There is nothing to deliver in that case.
    const staged = await execGit(
      ["diff", "--cached", "--name-only"],
      worktreePath,
      "git-worktree-environment",
      context,
    );
    const stagedFiles = staged.split(/\r?\n/).filter(Boolean);
    if (stagedFiles.length === 0) {
      return { committed: false, files: [], reason: "No changes to commit" };
    }

    await execGit(["commit", "-m", message], worktreePath, "git-worktree-environment", context);

    let sha: string | undefined;
    try {
      sha = (await execGit(["rev-parse", "HEAD"], worktreePath, "git-worktree-environment", context)).trim();
    } catch {
      // The commit succeeded; a missing SHA only weakens the receipt.
    }

    allowGitRoot(repoPath);
    // Report everything the branch carries, not only this attempt's staging
    // area: a retry resumes an existing branch, and the deliverable is the
    // branch as a whole.
    const branchFiles = baseSha
      ? await this.committedFiles(worktreePath, baseSha, context)
      : [];
    return {
      committed: true,
      branch: branchName,
      sha,
      files: branchFiles.length > 0 ? branchFiles : stagedFiles,
    };
  }

  /** Number of commits on this branch beyond the baseline it was created from. */
  private async commitsAheadOfBase(
    worktreePath: string,
    baseSha: string,
    context: { agentRunId: string; projectId: string },
  ): Promise<number> {
    if (!baseSha) return 0;
    try {
      const out = await execGit(
        ["rev-list", "--count", `${baseSha}..HEAD`],
        worktreePath,
        "git-worktree-environment",
        context,
      );
      return Number.parseInt(out.trim(), 10) || 0;
    } catch {
      return 0;
    }
  }

  /** Files changed by this branch relative to the baseline it was created from. */
  private async committedFiles(
    worktreePath: string,
    baseSha: string,
    context: { agentRunId: string; projectId: string },
  ): Promise<string[]> {
    if (!baseSha) return [];
    try {
      const out = await execGit(
        ["diff", "--name-only", baseSha, "HEAD"],
        worktreePath,
        "git-worktree-environment",
        context,
      );
      return out.split(/\r?\n/).filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Remove the runtime directory from the index.
   *
   * `git rm --cached` refuses when the path is not tracked, which is the
   * common case, so that specific failure is expected and ignored. Anything
   * else is rethrown rather than silently leaving runtime files in the commit.
   */
  private async unstageRuntimeDir(
    worktreePath: string,
    context: { agentRunId: string; projectId: string },
  ): Promise<void> {
    try {
      await execGit(
        ["rm", "--cached", "-r", "--quiet", "--ignore-unmatch", RUNTIME_DIR],
        worktreePath,
        "git-worktree-environment",
        context,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // --ignore-unmatch makes "not tracked" a success; anything reaching here
      // is a real failure and must not be swallowed.
      throw new Error(`Failed to exclude ${RUNTIME_DIR} from the delivery commit: ${message}`);
    }
  }

  /** Whether the repository already has this local branch. */
  private async branchExists(repoPath: string, branchName: string): Promise<boolean> {
    try {
      await execGit(
        ["rev-parse", "--verify", `refs/heads/${branchName}`],
        repoPath,
        "git-worktree-environment",
      );
      return true;
    } catch {
      return false;
    }
  }

  async dispose(sessionId: string): Promise<void> {
    const entry = sessions.get(sessionId);
    if (!entry) return;

    entry.session.state = "disposed";

    // Best-effort worktree removal
    try {
      await execGit(
        ["worktree", "remove", entry.data.worktreePath, "--force"],
        entry.data.repoPath,
        "git-worktree-environment",
      );
    } catch {
      // Best-effort cleanup
    }

    sessions.delete(sessionId);
  }

  private async runGitCommand(
    cwd: string,
    args: string[],
    kind: string,
  ): Promise<ActionResult> {
    try {
      const output = await execGit(args, cwd, "git-worktree-environment");
      return { success: true, kind, data: { output: output.trim() } };
    } catch (err) {
      return {
        success: false,
        kind,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
