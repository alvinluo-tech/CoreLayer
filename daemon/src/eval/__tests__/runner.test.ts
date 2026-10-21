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
      expectNoChange: false,
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

describe("negative tasks (expectNoChange)", () => {
  const negative: EvalCorpus = {
    name: "negative",
    attempts: 1,
    tasks: [
      {
        id: "leave-it-alone",
        title: "leave it alone",
        prompt: "do nothing",
        files: { "config.json": "{\"a\":1}\n" },
        checks: [{ type: "file-unchanged", path: "config.json" }],
        timeoutMs: 60_000,
        tags: ["restraint"],
        expectNoChange: true,
      },
    ],
  };

  it("passes an executor that changes nothing", async () => {
    const executor = scriptedExecutor((_id, workspace) => {
      // Reading the file is allowed; restraint is about writes.
      readFileSync(join(workspace, "config.json"), "utf-8");
      return { status: "succeeded" };
    });
    const result = await runCorpus(negative, executor, { cleanup: true });
    expect(result.attempts[0].passed).toBe(true);
  });

  it("fails an executor that writes a file nobody asked for", async () => {
    const executor = scriptedExecutor((_id, workspace) => {
      writeFileSync(join(workspace, "scratch.md"), "notes", "utf-8");
      return { status: "succeeded" };
    });
    const result = await runCorpus(negative, executor, { cleanup: true });
    expect(result.attempts[0].passed).toBe(false);
    const detail = result.attempts[0].verdict.checks.map((check) => check.detail).join(" ");
    expect(detail).toContain("scratch.md");
  });

  it("fails an executor that reformats a seeded file", async () => {
    const executor = scriptedExecutor((_id, workspace) => {
      writeFileSync(join(workspace, "config.json"), "{ \"a\": 1 }\n", "utf-8");
      return { status: "succeeded" };
    });
    const result = await runCorpus(negative, executor, { cleanup: true });
    expect(result.attempts[0].passed).toBe(false);
  });

  it("reports a distinct kind for the tree-level rule", async () => {
    const executor = scriptedExecutor(() => ({ status: "succeeded" }));
    const result = await runCorpus(negative, executor, { cleanup: true });
    expect(result.attempts[0].verdict.checks.map((check) => check.kind)).toContain("workspace-unchanged");
  });
});

describe("environment faults", () => {
  const quotaError =
    'Internal error: API Error: Request rejected (429) · {"detail":"usage exceeds frequency limit"}}';

  /** An executor that fails the way a provider outage fails: same error, every time. */
  function quotaExecutor(): EvalExecutor {
    return {
      name: "quota",
      async run() {
        return { status: "failed", error: quotaError };
      },
    };
  }

  const oneTask = (attempts = 2): EvalCorpus => ({ ...corpus, attempts });

  it("marks a quota rejection as an environment fault", async () => {
    const result = await runCorpus(oneTask(), quotaExecutor(), { cleanup: true });
    expect(result.attempts[0].failureKind).toBe("infra");
  });

  it("keeps voided attempts out of the reliability figures", async () => {
    const result = await runCorpus(oneTask(), quotaExecutor(), { cleanup: true });
    // The task never had a fair chance, so it is absent from the report rather
    // than recorded as an empty row that would read as a failure.
    expect(result.reliability.tasks).toHaveLength(0);
    expect(result.reliability.meanPassRate).toBe(0);
    expect(result.voided).toBe(result.attempts.length);
  });

  it("stops the run instead of spending a timeout on every remaining task", async () => {
    const many: EvalCorpus = {
      ...corpus,
      attempts: 3,
      tasks: [1, 2, 3, 4, 5].map((index) => ({ ...corpus.tasks[0], id: `t${index}`, title: `t${index}` })),
    };
    const result = await runCorpus(many, quotaExecutor(), { cleanup: true });

    expect(result.attempts.length).toBe(3);
    expect(result.attempts.every((record) => record.failureKind === "infra")).toBe(true);
  });

  it("does not stop for an agent failure, however many occur", async () => {
    const many: EvalCorpus = {
      ...corpus,
      attempts: 2,
      tasks: [1, 2, 3].map((index) => ({ ...corpus.tasks[0], id: `t${index}`, title: `t${index}` })),
    };
    const executor: EvalExecutor = {
      name: "lazy",
      async run() {
        return { status: "failed", error: "the agent gave up" };
      },
    };
    const result = await runCorpus(many, executor, { cleanup: true });
    expect(result.attempts).toHaveLength(6);
    expect(result.voided).toBe(0);
  });

  it("resets the run of faults once an attempt completes normally", async () => {
    let call = 0;
    const flaky: EvalExecutor = {
      name: "flaky",
      async run(_task, workspace) {
        call += 1;
        if (call <= 2) return { status: "failed", error: quotaError };
        writeFileSync(join(workspace, "OUT.txt"), "done", "utf-8");
        return { status: "succeeded" };
      },
    };
    const many: EvalCorpus = {
      ...corpus,
      attempts: 3,
      tasks: [1, 2].map((index) => ({ ...corpus.tasks[0], id: `t${index}`, title: `t${index}` })),
    };
    const result = await runCorpus(many, flaky, { cleanup: true });
    expect(result.attempts.length).toBe(6);
    expect(result.voided).toBe(2);
  });
});
