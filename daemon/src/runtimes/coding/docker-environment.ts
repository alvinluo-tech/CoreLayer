/**
 * DockerEnvironment — Docker-based execution environment backend.
 *
 * Provides stronger isolation than git worktrees by running
 * executor processes inside Docker containers.
 *
 * This is an optional backend, enabled by explicit configuration.
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
import { execFileSync, spawn } from "child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

function isDockerAvailable(): boolean {
  try {
    execFileSync("docker", ["info"], { stdio: "pipe", timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

interface DockerSessionData {
  containerId: string;
  image: string;
  workspaceMount: string;
  homeDir: string;
}

const sessions = new Map<string, { session: EnvironmentSession; data: DockerSessionData }>();

export class DockerEnvironment implements ExecutionEnvironment {
  readonly kind = "docker";

  async createSession(request: EnvironmentSessionRequest): Promise<EnvironmentSession> {
    if (!isDockerAvailable()) {
      throw new Error("Docker is not available on this system");
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const meta = request.metadata ?? {};
    const image = (meta.image as string) ?? "node:20-slim";
    const workingDir = request.workingDirectory ?? "/workspace";

    // Create a temporary directory for mounts
    const mountDir = join(tmpdir(), `jarvis-docker-${id.slice(0, 8)}`);
    mkdirSync(mountDir, { recursive: true });

    // Create container with workspace mount
    const containerId = execFileSync(
      "docker",
      [
        "create",
        "--rm",
        "--workdir", workingDir,
        "-v", `${mountDir}:/workspace`,
        "-e", "HOME=/home/jarvis",
        image,
        "sleep", "infinity",
      ],
      { stdio: "pipe", timeout: 30_000 },
    ).toString().trim();

    // Start the container
    execFileSync("docker", ["start", containerId], { stdio: "pipe", timeout: 10_000 });

    const session: EnvironmentSession = {
      id,
      environmentKind: this.kind,
      state: "ready",
      workingDirectory: workingDir,
      workspaceId: request.workspaceId,
      runId: request.runId,
      agentId: request.agentId,
      createdAt: now,
    };

    sessions.set(id, {
      session,
      data: { containerId, image, workspaceMount: mountDir, homeDir: "/home/jarvis" },
    });

    return session;
  }

  async getSession(sessionId: string): Promise<EnvironmentSession | null> {
    return sessions.get(sessionId)?.session ?? null;
  }

  async executeAction(sessionId: string, action: ActionRequest): Promise<ActionResult> {
    const entry = sessions.get(sessionId);
    if (!entry) return { success: false, kind: action.kind, error: "Session not found" };

    if (action.kind === "shell") {
      const command = (action.parameters?.command as string) ?? "";
      const result = await this.executeCommand(sessionId, command, action.timeoutMs);
      return {
        success: result.exitCode === 0,
        kind: action.kind,
        data: { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode },
        error: result.exitCode !== 0 ? result.stderr : undefined,
        durationMs: result.durationMs,
      };
    }

    return { success: false, kind: action.kind, error: `Unknown action: ${action.kind}` };
  }

  async executeCommand(sessionId: string, command: string, timeoutMs = 30_000): Promise<CommandResult> {
    const entry = sessions.get(sessionId);
    if (!entry) throw new Error("Session not found");

    const start = Date.now();
    return new Promise((resolve, reject) => {
      const proc = spawn("docker", ["exec", entry.data.containerId, "sh", "-c", command], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
      proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

      const timeout = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error("Command timed out"));
      }, timeoutMs);

      proc.on("close", (code) => {
        clearTimeout(timeout);
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
          durationMs: Date.now() - start,
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  async readFile(sessionId: string, path: string): Promise<FileReadResult> {
    const entry = sessions.get(sessionId);
    if (!entry) throw new Error("Session not found");

    const content = execFileSync(
      "docker",
      ["exec", entry.data.containerId, "cat", path],
      { stdio: "pipe", timeout: 10_000 },
    ).toString();

    return { path, content, encoding: "utf-8", size: content.length };
  }

  async writeFile(sessionId: string, path: string, content: string): Promise<FileWriteResult> {
    const entry = sessions.get(sessionId);
    if (!entry) throw new Error("Session not found");

    // Write to temp file, then copy into container
    const tmpFile = join(tmpdir(), `jarvis-write-${Date.now()}`);
    writeFileSync(tmpFile, content, "utf-8");

    try {
      execFileSync(
        "docker",
        ["cp", tmpFile, `${entry.data.containerId}:${path}`],
        { stdio: "pipe", timeout: 10_000 },
      );
    } finally {
      try {
        unlinkSync(tmpFile);
      } catch {
        // Best-effort cleanup; Docker copy failure should remain the surfaced error.
      }
    }

    return { path, bytesWritten: Buffer.byteLength(content, "utf-8") };
  }

  async collectArtifacts(sessionId: string): Promise<Artifact[]> {
    const entry = sessions.get(sessionId);
    if (!entry) return [];

    const artifacts: Artifact[] = [];
    const now = new Date().toISOString();

    try {
      // List files in workspace
      const output = execFileSync(
        "docker",
        ["exec", entry.data.containerId, "find", "/workspace", "-type", "f", "-newer", "/workspace"],
        { stdio: "pipe", timeout: 10_000 },
      ).toString();

      const files = output.trim().split("\n").filter(Boolean);
      if (files.length > 0) {
        artifacts.push({
          id: crypto.randomUUID(),
          kind: "changed-files",
          content: JSON.stringify(files),
          summary: `${files.length} file(s) in workspace`,
          metadata: { files },
          createdAt: now,
        });
      }
    } catch {
      // Best-effort
    }

    return artifacts;
  }

  async dispose(sessionId: string): Promise<void> {
    const entry = sessions.get(sessionId);
    if (!entry) return;

    entry.session.state = "disposed";

    try {
      execFileSync("docker", ["stop", entry.data.containerId], {
        stdio: "pipe",
        timeout: 15_000,
      });
    } catch {
      // Best-effort cleanup
    }

    sessions.delete(sessionId);
  }
}
