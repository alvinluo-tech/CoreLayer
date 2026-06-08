/**
 * Process Spawner — cross-platform subprocess management for coding runtimes.
 *
 * Handles spawning, streaming, and killing child processes
 * with proper cleanup on Windows and Unix.
 */

import { spawn, type ChildProcess } from "child_process";
export interface SpawnOptions {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface SpawnedProcess {
  pid: number;
  process: ChildProcess;
  stdout: string[];
  stderr: string[];
  exitCode: number | null;
  killed: boolean;
}

export interface SpawnResult {
  pid: number;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

const activeProcesses = new Map<number, ChildProcess>();

/**
 * Spawn a subprocess and collect its output.
 * Resolves when the process exits, rejects on timeout or spawn error.
 */
export function spawnProcess(options: SpawnOptions): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];

    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    if (child.pid) {
      activeProcesses.set(child.pid, child);
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (options.timeoutMs && options.timeoutMs > 0) {
      timeout = setTimeout(() => {
        killProcessTree(child.pid!);
        reject(new Error(`Process timed out after ${options.timeoutMs}ms`));
      }, options.timeoutMs);
    }

    child.stdout?.on("data", (data: Buffer) => {
      stdoutLines.push(data.toString());
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderrLines.push(data.toString());
    });

    child.on("error", (err) => {
      if (timeout) clearTimeout(timeout);
      activeProcesses.delete(child.pid!);
      reject(err);
    });

    child.on("close", (code) => {
      if (timeout) clearTimeout(timeout);
      if (child.pid) activeProcesses.delete(child.pid);

      const durationMs = Date.now() - startTime;
      resolve({
        pid: child.pid ?? 0,
        stdout: stdoutLines.join(""),
        stderr: stderrLines.join(""),
        exitCode: code ?? 1,
        durationMs,
      });
    });
  });
}

/**
 * Kill a process and its entire tree (cross-platform).
 * Windows: taskkill /F /T /PID
 * Unix: kill -TERM -PGID (process group)
 */
export function killProcessTree(pid: number): void {
  if (!pid) return;

  if (process.platform === "win32") {
    // Windows: use taskkill to kill the process tree
    try {
      const { execFileSync } = require("child_process");
      execFileSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" });
    } catch {
      // Process may already be dead
    }
  } else {
    // Unix: kill process group
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      // Fallback to killing just the process
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // Process may already be dead
      }
    }
  }
}

/**
 * Kill all active spawned processes (for shutdown cleanup).
 */
export function killAllProcesses(): void {
  for (const pid of activeProcesses.keys()) {
    killProcessTree(pid);
  }
  activeProcesses.clear();
}

/**
 * Get count of active external processes.
 */
export function getActiveProcessCount(): number {
  return activeProcesses.size;
}
