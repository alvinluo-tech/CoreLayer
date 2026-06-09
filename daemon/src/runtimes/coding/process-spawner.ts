/**
 * Process Spawner — cross-platform subprocess management for coding runtimes.
 *
 * Handles spawning, streaming, and killing child processes
 * with proper cleanup on Windows and Unix.
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
