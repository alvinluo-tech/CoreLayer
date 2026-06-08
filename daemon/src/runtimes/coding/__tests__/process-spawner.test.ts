/**
 * Unit tests for the process spawner.
 *
 * Tests isCommandAvailable and spawnProcessLive with system commands.
 */

import { describe, it, expect } from "vitest";
import { isCommandAvailable, spawnProcessLive } from "../process-spawner.js";

// ---- isCommandAvailable ----

describe("isCommandAvailable", () => {
  it("returns true for 'node' (known to exist)", () => {
    expect(isCommandAvailable("node")).toBe(true);
  });

  it("returns true for 'npm' (known to exist)", () => {
    expect(isCommandAvailable("npm")).toBe(true);
  });

  it("returns false for a non-existent command", () => {
    expect(isCommandAvailable("this-command-definitely-does-not-exist-xyz")).toBe(false);
  });
});

// ---- spawnProcessLive ----

describe("spawnProcessLive", () => {
  it("returns a handle with a numeric pid", () => {
    const handle = spawnProcessLive({
      command: "node",
      args: ["-e", "process.exit(0)"],
    });

    expect(handle).toBeDefined();
    expect(typeof handle.pid).toBe("number");
    expect(handle.pid).toBeGreaterThan(0);
    expect(handle.process).toBeDefined();
    expect(Array.isArray(handle.stdout)).toBe(true);
    expect(Array.isArray(handle.stderr)).toBe(true);
    expect(handle.exitCode).toBeNull();
    expect(handle.killed).toBe(false);
  });

  it("spawns a process that produces stdout output", async () => {
    const stdoutChunks: string[] = [];
    const handle = spawnProcessLive({
      command: "node",
      args: ["-e", "console.log('hello-from-spawn')"],
      onStdout: (chunk) => stdoutChunks.push(chunk),
    });

    // Wait for the process to exit
    await new Promise<void>((resolve) => {
      handle.process.on("close", () => resolve());
    });

    const combined = handle.stdout.join("");
    expect(combined).toContain("hello-from-spawn");
  });

  it("returns pid that matches the child process pid", () => {
    const handle = spawnProcessLive({
      command: "node",
      args: ["-e", "setTimeout(() => {}, 1000)"],
    });

    expect(handle.pid).toBe(handle.process.pid);

    // Clean up the long-running process
    handle.process.kill();
  });
});
