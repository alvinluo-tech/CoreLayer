/**
 * Integration tests for the Process Spawner.
 *
 * Uses real subprocesses to verify spawning, streaming, timeout,
 * and process tree killing behavior. Creates temporary script files
 * to avoid Windows shell quoting issues with `node -e`.
 */

import { describe, it, expect, afterEach } from "vitest";
import { join } from "path";
import { tmpdir } from "os";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "fs";
import {
  spawnProcess,
  spawnProcessLive,
  killProcessTree,
  isCommandAvailable,
  validateWorkdirPolicy,
  getActiveProcessCount,
} from "../process-spawner.js";

let tempDir: string;

function createScript(name: string, jsContent: string): string {
  if (!tempDir) {
    tempDir = mkdtempSync(join(tmpdir(), "jarvis-test-"));
  }
  const scriptPath = join(tempDir, `${name}.js`);
  writeFileSync(scriptPath, jsContent);
  return scriptPath;
}

/** Build spawn args for running a .js script directly with node */
function nodeScript(scriptPath: string): { command: string; args: string[] } {
  return { command: "node", args: [scriptPath] };
}

afterEach(() => {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined!;
  }
});

// ---- isCommandAvailable ----

describe("isCommandAvailable (integration)", () => {
  it("returns true for 'node' which is always available", () => {
    expect(isCommandAvailable("node")).toBe(true);
  });

  it("returns false for a nonexistent command", () => {
    expect(isCommandAvailable("nonexistent-command-xyz-12345")).toBe(false);
  });
});

// ---- validateWorkdirPolicy ----

describe("validateWorkdirPolicy (integration)", () => {
  it("allows a real temporary directory", () => {
    tempDir = mkdtempSync(join(tmpdir(), "jarvis-test-"));
    const result = validateWorkdirPolicy(tempDir);
    expect(result.allowed).toBe(true);
  });

  it("rejects a nonexistent directory", () => {
    const result = validateWorkdirPolicy("/nonexistent/path/that/does/not/exist");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("does not exist");
  });

  it("rejects a file path instead of directory", () => {
    tempDir = mkdtempSync(join(tmpdir(), "jarvis-test-"));
    const filePath = join(tempDir, "file.txt");
    writeFileSync(filePath, "hello");
    const result = validateWorkdirPolicy(filePath);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not a directory");
  });
});

// ---- spawnProcess ----

describe("spawnProcess (integration)", () => {
  it("runs a simple command and captures stdout", async () => {
    const script = createScript("echo-hello", "console.log('hello world')");
    const { command, args } = nodeScript(script);
    const result = await spawnProcess({ command, args });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello world");
    expect(result.pid).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("captures stderr on error", async () => {
    const script = createScript("echo-err", "console.error('error output'); process.exit(1)");
    const { command, args } = nodeScript(script);
    const result = await spawnProcess({ command, args });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.trim()).toBe("error output");
  });

  it("resolves with exit code on non-zero exit", async () => {
    const script = createScript("exit-42", "process.exit(42)");
    const { command, args } = nodeScript(script);
    const result = await spawnProcess({ command, args });

    expect(result.exitCode).toBe(42);
  });

  it("runs in specified working directory", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "jarvis-test-"));
    const script = createScript("print-cwd", "console.log(process.cwd())");
    const { command, args } = nodeScript(script);
    const result = await spawnProcess({ command, args, cwd: tempDir });

    // Normalize path separators for cross-platform comparison
    const expected = tempDir.replace(/\\/g, "/");
    const actual = result.stdout.trim().replace(/\\/g, "/");
    expect(actual).toBe(expected);
  });
});

// ---- spawnProcessLive ----

describe("spawnProcessLive (integration)", () => {
  it("returns a handle with pid and process", () => {
    const script = createScript("live-echo", "console.log('live')");
    const { command, args } = nodeScript(script);
    const handle = spawnProcessLive({ command, args });

    expect(handle.pid).toBeGreaterThan(0);
    expect(handle.process).toBeDefined();
    expect(handle.stdout).toEqual([]);
    expect(handle.stderr).toEqual([]);
    expect(handle.exitCode).toBeNull();
    expect(handle.killed).toBe(false);
  });

  it("streams stdout chunks via onStdout callback", async () => {
    const script = createScript("stream-stdout", "console.log('line1'); console.log('line2')");
    const { command, args } = nodeScript(script);
    const chunks: string[] = [];
    const handle = spawnProcessLive({ command, args, onStdout: (chunk) => chunks.push(chunk) });

    await new Promise<void>((resolve) => {
      handle.process.on("close", () => resolve());
    });

    expect(chunks.length).toBeGreaterThan(0);
    const output = chunks.join("");
    expect(output).toContain("line1");
    expect(output).toContain("line2");
  });

  it("streams stderr chunks via onStderr callback", async () => {
    const script = createScript("stream-stderr", "console.error('err line')");
    const { command, args } = nodeScript(script);
    const chunks: string[] = [];
    const handle = spawnProcessLive({ command, args, onStderr: (chunk) => chunks.push(chunk) });

    await new Promise<void>((resolve) => {
      handle.process.on("close", () => resolve());
    });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join("")).toContain("err line");
  });

  it("writes logs to logDir when specified", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "jarvis-test-"));
    const script = createScript("log-output", "console.log('logged output')");
    const { command, args } = nodeScript(script);
    const handle = spawnProcessLive({ command, args, logDir: tempDir });

    await new Promise<void>((resolve) => {
      handle.process.on("close", () => resolve());
    });

    const logFile = join(tempDir, `run-${handle.pid}.log`);
    expect(existsSync(logFile)).toBe(true);
  });
});

// ---- killProcessTree ----

describe("killProcessTree (integration)", () => {
  it("kills a running process", async () => {
    const script = createScript("long-running", "setTimeout(() => {}, 60000)");
    const { command, args } = nodeScript(script);
    const handle = spawnProcessLive({ command, args });

    expect(handle.pid).toBeGreaterThan(0);

    // Wait a bit for process to start
    await new Promise((r) => setTimeout(r, 200));

    killProcessTree(handle.pid);

    // Wait for process to exit
    await new Promise<void>((resolve) => {
      handle.process.on("close", () => resolve());
      // Safety timeout
      setTimeout(resolve, 2000);
    });

    expect(handle.process.exitCode).not.toBe(0);
  }, 5000);
});

// ---- getActiveProcessCount ----

describe("getActiveProcessCount (integration)", () => {
  it("returns a number >= 0", () => {
    const count = getActiveProcessCount();
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
