/**
 * Delivery service tests — real git repositories, no mocks.
 * These cover the gap that previously made every "successful" run deliver
 * nothing: work must survive on a branch the user can review and merge.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { listDeliveredBranches, mergeDeliveredBranch } from "../delivery-service.js";

function gitAvailable(): boolean {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", ["git"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const describeIfGit = gitAvailable() ? describe : describe.skip;

describeIfGit("delivery service", () => {
  let repo: string;

  function git(args: string[], cwd = repo): string {
    return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: "pipe" });
  }

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "jarvis-delivery-"));
    git(["init"]);
    git(["config", "user.email", "test@test.com"]);
    git(["config", "user.name", "Test"]);
    writeFileSync(join(repo, "README.md"), "# Test\n");
    git(["add", "."]);
    git(["commit", "-m", "init"]);
  });

  afterAll(() => {
    if (existsSync(repo)) rmSync(repo, { recursive: true, force: true });
  });

  it("lists an agent branch with its files and commit count", async () => {
    git(["checkout", "-b", "agent/aaaa1111"]);
    writeFileSync(join(repo, "added.txt"), "work\n");
    git(["add", "-A"]);
    git(["commit", "-m", "add a file"]);
    git(["checkout", "master"]);

    const branches = await listDeliveredBranches(repo);
    const found = branches.find((b) => b.branch === "agent/aaaa1111");

    expect(found).toBeDefined();
    expect(found!.commitsAhead).toBe(1);
    expect(found!.files).toContain("added.txt");
    expect(found!.subject).toBe("add a file");
  });

  it("hides branches already merged into the base", async () => {
    await mergeDeliveredBranch(repo, "agent/aaaa1111");

    const branches = await listDeliveredBranches(repo);
    expect(branches.find((b) => b.branch === "agent/aaaa1111")).toBeUndefined();
    expect(existsSync(join(repo, "added.txt"))).toBe(true);
  });

  it("merges an agent branch into the base branch", async () => {
    git(["checkout", "-b", "agent/bbbb2222"]);
    writeFileSync(join(repo, "second.txt"), "more work\n");
    git(["add", "-A"]);
    git(["commit", "-m", "second deliverable"]);
    git(["checkout", "master"]);

    const result = await mergeDeliveredBranch(repo, "agent/bbbb2222");

    expect(result.merged).toBe(true);
    expect(git(["log", "--oneline"])).toContain("second deliverable");
  });

  it("refuses to merge a branch that is not an agent branch", async () => {
    const result = await mergeDeliveredBranch(repo, "feature/sneaky");

    expect(result.merged).toBe(false);
    expect(result.reason).toContain("Refusing to merge non-agent branch");
  });

  it("reports a conflict instead of forcing the merge", async () => {
    git(["checkout", "-b", "agent/cccc3333"]);
    writeFileSync(join(repo, "README.md"), "# Agent version\n");
    git(["add", "-A"]);
    git(["commit", "-m", "conflicting change"]);
    git(["checkout", "master"]);
    writeFileSync(join(repo, "README.md"), "# User version\n");
    git(["add", "-A"]);
    git(["commit", "-m", "user change"]);

    const result = await mergeDeliveredBranch(repo, "agent/cccc3333");

    expect(result.merged).toBe(false);
    // The user's own commit must survive an aborted merge.
    expect(git(["log", "-1", "--format=%s"]).trim()).toBe("user change");
  });
});
