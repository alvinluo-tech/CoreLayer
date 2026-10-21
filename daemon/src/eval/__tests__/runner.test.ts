import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCorpus, type EvalExecutor } from "../runner.js";
import type { EvalCorpus } from "../corpus.js";

/** An executor that does exactly what the test asks, so the harness is what is measured. */
function scriptedExecutor(
  behaviour: (taskId: string, workspace: string, attempt: number) => { status: "succeeded" | "failed"; fakeSuccess?: boolean },
): EvalExecutor {
  let attempt = 0;
  return {
    name: "scripted",
    async run(task, workspace) {
      attempt += 1;
      const { status } = behaviour(task.id, workspace, attempt);
      return { status, ...(status === "failed" ? { error: "scripted failure" } : {}) };
    },
  };
}

const corpus: EvalCorpus = {
  name: "unit",
  attempts: 2,
  tasks: [
    {
      id: "write",
      title: "write",
      prompt: "write",
      files: { "seed.txt": "seed\n" },
      checks: [{ type: "file-exists", path: "OUT.txt" }],
      timeoutMs: 60_000,
      tags: ["write"],
    },
  ],
};

describe("runCorpus", () => {
  it("gives every attempt its own seeded repository", async () => {
    const seen: string[] = [];
    const executor = scriptedExecutor((_id, workspace) => {
      seen.push(workspace);
      const seed = readFileSync(join(workspace, "seed.txt"), "utf-8");
      expect(seed).toBe("seed\n");
      expect(existsSync(join(workspace, ".git"))).toBe(true);
      writeFileSync(join(workspace, "OUT.txt"), "done", "utf-8");
      return { status: "succeeded" };
    });

    const result = await runCorpus(corpus, executor, { cleanup: false });

    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
    expect(result.attempts.every((record) => record.passed)).toBe(true);
    expect(result.reliability.meanPassAll).toBe(1);
  });

  it("records a run whose checks fail even when the executor claimed success", async () => {
    const executor = scriptedExecutor(() => ({ status: "succeeded" }));
    const result = await runCorpus(corpus, executor, { cleanup: true });

    expect(result.attempts.every((record) => record.passed === false)).toBe(true);
    expect(result.falsePositives).toBe(2);
    expect(result.reliability.meanPassAll).toBe(0);
  });

  it("records a passing task whose executor reported failure as a false negative", async () => {
    const executor = scriptedExecutor((_id, workspace) => {
      writeFileSync(join(workspace, "OUT.txt"), "done", "utf-8");
      return { status: "failed" };
    });
    const result = await runCorpus(corpus, executor, { cleanup: true });

    expect(result.attempts.every((record) => record.passed)).toBe(true);
    expect(result.falseNegatives).toBe(2);
  });

  it("treats a throwing executor as a failed attempt, not a crashed harness", async () => {
    const executor: EvalExecutor = {
      name: "thrower",
      async run() {
        throw new Error("boom");
      },
    };
    const result = await runCorpus(corpus, executor, { cleanup: true });
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0].executor).toBe("failed");
    expect(result.attempts[0].executorError).toBe("boom");
  });

  it("honours --only by skipping other tasks", async () => {
    const twoTasks: EvalCorpus = {
      ...corpus,
      tasks: [
        ...corpus.tasks,
        { ...corpus.tasks[0], id: "other", title: "other" },
      ],
    };
    const executor = scriptedExecutor(() => ({ status: "failed" }));
    const result = await runCorpus(twoTasks, executor, { cleanup: true, only: ["other"] });

    expect(new Set(result.attempts.map((record) => record.taskId))).toEqual(new Set(["other"]));
    expect(result.reliability.tasks.map((task) => task.taskId)).toEqual(["other"]);
  });

  it("stops starting new attempts once the run is aborted", async () => {
    const controller = new AbortController();
    const executor: EvalExecutor = {
      name: "aborter",
      async run() {
        controller.abort();
        return { status: "failed" };
      },
    };
    const result = await runCorpus({ ...corpus, attempts: 5 }, executor, {
      cleanup: true,
      signal: controller.signal,
    });
    expect(result.attempts).toHaveLength(1);
  });

  it("removes attempt workspaces unless asked to keep them", async () => {
    const executor = scriptedExecutor(() => ({ status: "failed" }));
    const result = await runCorpus(corpus, executor, { cleanup: true });
    for (const record of result.attempts) {
      expect(existsSync(record.workspace)).toBe(false);
    }
  });

  it("commits the seed so executors that diff against HEAD have a base", async () => {
    let log = "";
    const executor = scriptedExecutor((_id, workspace) => {
      log = execFileSync("git", ["log", "--oneline"], { cwd: workspace }).toString();
      return { status: "failed" };
    });
    await runCorpus({ ...corpus, attempts: 1 }, executor, { cleanup: true });
    expect(log).toContain("eval seed");
  });
});
