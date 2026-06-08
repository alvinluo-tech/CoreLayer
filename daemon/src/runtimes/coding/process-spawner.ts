/**
 * Process Spawner — cross-platform subprocess management for coding runtimes.
 *
 * Handles spawning, streaming, and killing child processes
 * with proper cleanup on Windows and Unix.
 */

import { spawn, execFileSync, type ChildProcess } from "child_process";
import { mkdirSync, appendFileSync } from "fs";
import { join } from "path";

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
 * Check if a command is available on the system PATH.
 */
export function isCommandAvailable(command: string): boolean {
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    execFileSync(cmd, [command], { stdio: "ignore", timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
}

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
 * Spawn a process and return a handle for live streaming/cancellation.
 * Unlike spawnProcess, this does NOT wait for the process to complete.
 * The caller must attach data handlers and wait for the 'close' event.
 */
export function spawnProcessLive(
  options: SpawnOptions & {
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
    logDir?: string;
  },
): SpawnedProcess {
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ["pipe", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  if (child.pid) {
    activeProcesses.set(child.pid, child);
  }

  const stdout: string[] = [];
  const stderr: string[] = [];

  // Write to log files if logDir is provided
  let logFile: string | undefined;
  if (options.logDir && child.pid) {
    try {
      mkdirSync(options.logDir, { recursive: true });
      logFile = join(options.logDir, `run-${child.pid}.log`);
    } catch {
      // Log dir creation failed — continue without persistence
    }
  }

  child.stdout?.on("data", (data: Buffer) => {
    const chunk = data.toString();
    stdout.push(chunk);
    options.onStdout?.(chunk);
    if (logFile) {
      try {
        appendFileSync(logFile, `[STDOUT] ${chunk}`);
      } catch {
        // Write failure — continue
      }
    }
  });

  child.stderr?.on("data", (data: Buffer) => {
    const chunk = data.toString();
    stderr.push(chunk);
    options.onStderr?.(chunk);
    if (logFile) {
      try {
        appendFileSync(logFile, `[STDERR] ${chunk}`);
      } catch {
        // Write failure — continue
      }
    }
  });

  child.on("close", () => {
    if (child.pid) activeProcesses.delete(child.pid);
  });

  child.on("error", () => {
    if (child.pid) activeProcesses.delete(child.pid);
  });

  return {
    pid: child.pid ?? 0,
    process: child,
    stdout,
    stderr,
    exitCode: null,
    killed: false,
  };
}

/**
 * Kill a process and its entire tree (cross-platform).
 * Windows: taskkill /F /T /PID
 * Unix: kill -TERM -PGID (process group)
 */
export function killProcessTree(pid: number): void {
  if (!pid) return;

  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" });
    } catch {
      // Process may already be dead
    }
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
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
