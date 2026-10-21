import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { judgeAttempt } from "../judge.js";
import type { EvalTask } from "../corpus.js";

function task(checks: EvalTask["checks"]): EvalTask {
  return {
    id: "t",
    title: "t",
    prompt: "t",
    files: {},
    checks,
    timeoutMs: 60_000,
    tags: [],
    // Task ids in these tests never call for restraint; the runner-level tests
    // cover that rule.
    expectNoChange: false,
  };
}

describe("judgeAttempt", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jarvis-eval-judge-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("passes only when every check passes", async () => {
    writeFileSync(join(workspace, "a.md"), "hello", "utf-8");
    const verdict = await judgeAttempt(
      task([
        { type: "file-exists", path: "a.md" },
        { type: "file-contains", path: "a.md", text: "hello" },
      ]),
      workspace,
    );
    expect(verdict.passed).toBe(true);
  });

  it("fails when a check cannot be evaluated", async () => {
    const verdict = await judgeAttempt(task([{ type: "file-contains", path: "missing.md", text: "x" }]), workspace);
    expect(verdict.passed).toBe(false);
    expect(verdict.checks[0].passed).toBe(false);
  });

  it("refuses a path that escapes the workspace", async () => {
    const verdict = await judgeAttempt(task([{ type: "file-exists", path: "../escape" }]), workspace);
    expect(verdict.passed).toBe(false);
    expect(verdict.checks[0].detail).toContain("escapes workspace");
  });

  it("refuses an absolute path", async () => {
    const verdict = await judgeAttempt(task([{ type: "file-exists", path: "C:\\Windows" }]), workspace);
    expect(verdict.passed).toBe(false);
  });

  it("checks file-missing only when the file is really gone", async () => {
    mkdirSync(join(workspace, "build"));
    writeFileSync(join(workspace, "build", "tmp"), "x", "utf-8");
    expect((await judgeAttempt(task([{ type: "file-missing", path: "build/tmp" }]), workspace)).passed).toBe(false);

    rmSync(join(workspace, "build", "tmp"));
    expect((await judgeAttempt(task([{ type: "file-missing", path: "build/tmp" }]), workspace)).passed).toBe(true);
  });

  it("runs a command check inside the workspace", async () => {
    writeFileSync(join(workspace, "value.txt"), "42", "utf-8");
    const command = process.platform === "win32" ? "type value.txt | findstr 42" : "grep -q 42 value.txt";
    const verdict = await judgeAttempt(task([{ type: "command", command }]), workspace);
    expect(verdict.passed).toBe(true);
  });

  it("treats a failing command as a failed check", async () => {
    const command = process.platform === "win32" ? "exit 1" : "false";
    const verdict = await judgeAttempt(task([{ type: "command", command }]), workspace);
    expect(verdict.passed).toBe(false);
  });

  it("passes file-unchanged only while the seeded bytes are intact", async () => {
    const seeded = "{\n  \"keep\": true\n}\n";
    writeFileSync(join(workspace, "data.json"), seeded, "utf-8");
    const checks: EvalTask["checks"] = [{ type: "file-unchanged", path: "data.json" }];
    // The digest comes from what the task seeded, not from the file on disk now,
    // or the check would compare the workspace with itself.
    const seededTask: EvalTask = { ...task(checks), files: { "data.json": seeded } };

    // Reformatting the JSON changes every byte while keeping the same value;
    // that is what a "do not touch this file" requirement has to catch.
    writeFileSync(join(workspace, "data.json"), JSON.stringify(JSON.parse(seeded)), "utf-8");
    expect((await judgeAttempt(seededTask, workspace)).passed).toBe(false);

    writeFileSync(join(workspace, "data.json"), seeded, "utf-8");
    expect((await judgeAttempt(seededTask, workspace)).passed).toBe(true);
  });

  it("fails file-unchanged when the file was deleted", async () => {
    const verdict = await judgeAttempt(task([{ type: "file-unchanged", path: "gone.txt" }]), workspace, {
      seedDigests: { "gone.txt": "expected" },
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.checks[0].detail).toContain("deleted");
  });

  it("fails file-unchanged with no seed to compare against", async () => {
    writeFileSync(join(workspace, "x.txt"), "x", "utf-8");
    const verdict = await judgeAttempt(task([{ type: "file-unchanged", path: "x.txt" }]), workspace);
    expect(verdict.passed).toBe(false);
    expect(verdict.checks[0].detail).toContain("not seeded");
  });
});
