/**
 * Process Spawner — cross-platform subprocess management for coding runtimes.
 *
 * Handles spawning, streaming, and killing child processes
 * with proper cleanup on Windows and Unix. This module is the daemon's single
 * entry point for child-process authority; anything outside
 * `runtimes/coding/adapters` and `capabilities/adapters` goes through it.
 */

import { spawn, execFileSync, type ChildProcess } from "child_process";
import { mkdirSync, appendFileSync, existsSync, statSync } from "fs";
import { join, resolve } from "path";

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
 * Why the spawn paths do not use a shell on Windows.
 *
 * `shell: true` routes argv through `cmd.exe`, which ends the command at the
 * first newline and has no reliable escape for an embedded `"`. A coding prompt
 * is multi-line text containing quotes, so it arrived at the agent truncated
 * while the process still exited 0 — a partial task that looked complete. The
 * commands passed here are always an executable plus an argv array, never a
 * shell pipeline, so dropping the shell costs nothing.
 */

export interface WorkdirPolicyResult {
  allowed: boolean;
  reason?: string;
}

/** System directories that should never be used as working directories. */
const BLOCKED_PREFIXES = [
  "/bin",
  "/sbin",
  "/usr",
  "/lib",
  "/etc",
  "/var",
  "/sys",
  "/proc",
  "/dev",
  "/boot",
  "C:\\Windows",
  "C:\\Program Files",
  "C:\\Program Files (x86)",
];

/**
 * Validate a working directory against the worktree policy.
 *
 * Checks:
 * 1. Directory exists
 * 2. Is a directory (not a file)
 * 3. Not within blocked system directories
 */
export function validateWorkdirPolicy(cwd: string): WorkdirPolicyResult {
  const resolved = resolve(cwd);

  if (!existsSync(resolved)) {
    return { allowed: false, reason: `Directory does not exist: ${resolved}` };
  }

  if (!statSync(resolved).isDirectory()) {
    return { allowed: false, reason: `Path is not a directory: ${resolved}` };
  }

  for (const prefix of BLOCKED_PREFIXES) {
    if (resolved.toLowerCase().startsWith(prefix.toLowerCase())) {
      return {
        allowed: false,
        reason: `Working directory is within a blocked system path: ${prefix}`,
      };
    }
  }

  return { allowed: true };
}

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
 * Resolve the full path of a command on the system PATH.
 * Returns the executable path or null if not found.
 */
export function getExecutablePath(command: string): string | null {
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const output = execFileSync(cmd, [command], { encoding: "utf-8", timeout: 3_000 }).trim();
    // `where` on Windows can return multiple lines; take the first
    return output.split("\n")[0]?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * Run a command to completion and return its stdout, or throw when it exits
 * non-zero or exceeds `timeoutMs`.
 *
 * Unlike `spawnProcess`, this throws instead of returning an exit code, which
 * suits control-flow callers that treat a non-zero exit as a failure rather
 * than as data.
 */
export function execFileSyncBuffered(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): string {
  return execFileSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeoutMs ?? 30_000,
  });
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

    // No shell on any platform: `command` is an executable and `args` is already
    // an argv array, so the shell only adds ways to corrupt an argument. On
    // Windows it ended a multi-line prompt at the first newline and exited 0,
    // which made a truncated task look like a completed one.
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
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
  // No shell, on any platform.
  //
  // `shell: true` on Windows routes every argument through `cmd.exe`, which ends
  // the command at the first newline and re-interprets quotes. A coding prompt is
  // multi-line text with quotes in it, so the agent received a truncated prompt
  // and answered accordingly, while the exit code still said success. The
  // command here is always an executable plus an argv array (node, acpx), never
  // a shell pipeline, so nothing is lost by dropping the shell.
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (child.pid) {
    activeProcesses.set(child.pid, child);
  }

  const stdout: string[] = [];
  const stderr: string[] = [];
  const handle: SpawnedProcess = {
    pid: child.pid ?? 0,
    process: child,
    stdout,
    stderr,
    exitCode: null,
    killed: false,
  };
  let timeout: ReturnType<typeof setTimeout> | undefined;

  if (options.timeoutMs && options.timeoutMs > 0) {
    timeout = setTimeout(() => {
      if (child.pid) {
        handle.killed = true;
        killProcessTree(child.pid);
      }
    }, options.timeoutMs);
  }

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

  child.on("close", (code) => {
    if (timeout) clearTimeout(timeout);
    handle.exitCode = code;
    if (child.pid) activeProcesses.delete(child.pid);
  });

  child.on("error", () => {
    if (timeout) clearTimeout(timeout);
    if (child.pid) activeProcesses.delete(child.pid);
  });

  return handle;
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
