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
} from "@jarvis/execution-environment";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execGit, allowGitRoot } from "../../capabilities/adapters/git-command-adapter.js";
import { spawnProcess } from "./process-spawner.js";

interface WorktreeSessionData {
  repoPath: string;
  worktreePath: string;
  branchName: string;
  projectWorkspaceId: string;
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
    const worktreeRoot = join(repoPath, ".jarvis", "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });

    allowGitRoot(repoPath);
    allowGitRoot(worktreeRoot);

    const worktreePath = join(worktreeRoot, `run-${id.slice(0, 8)}`);

    try {
      await execGit(
        ["worktree", "add", "-b", branchName, worktreePath, "HEAD"],
        repoPath,
        "git-worktree-environment",
        { agentRunId: request.runId, projectId: request.workspaceId },
      );
    } catch {
      try {
        await execGit(
          ["worktree", "add", worktreePath, branchName],
          repoPath,
          "git-worktree-environment",
          { agentRunId: request.runId, projectId: request.workspaceId },
        );
      } catch (err) {
        throw new Error(`Failed to create worktree: ${err}`);
      }
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
      data: { repoPath, worktreePath, branchName, projectWorkspaceId: request.workspaceId },
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
