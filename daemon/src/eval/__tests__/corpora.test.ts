import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseCorpus } from "../corpus.js";

const CORPORA = ["core", "holdout"].map((name) => ({
  name,
  path: resolve(__dirname, "..", "corpora", `${name}.json`),
}));

/**
 * The shipped corpora are data, so their mistakes do not fail a typecheck. A
 * check written with the wrong key silently becomes a task nobody can pass, and
 * the run then reads as "the agent is unreliable". These tests make the data as
 * strict as the code.
 */
function loadShippedCorpus(path: string) {
  return parseCorpus(JSON.parse(readFileSync(path, "utf-8")));
}

describe.each(CORPORA)("$name.json", ({ name, path }) => {
  const corpus = loadShippedCorpus(path);

  it("parses, with the expected name and an attempt count", () => {
    expect(corpus.name).toBe(name);
    expect(corpus.attempts).toBeGreaterThanOrEqual(1);
    expect(corpus.tasks.length).toBeGreaterThan(0);
  });

  it("only uses check types the judge implements", () => {
    const known = new Set(["file-exists", "file-missing", "file-contains", "file-unchanged", "command"]);
    for (const task of corpus.tasks) {
      for (const check of task.checks) {
        expect(known, `${task.id} uses unknown check type '${check.type}'`).toContain(check.type);
      }
    }
  });

  it("fills in the fields each check type needs", () => {
    for (const task of corpus.tasks) {
      for (const check of task.checks) {
        if (check.type === "command") {
          expect(check.command.trim().length, `${task.id} has an empty command`).toBeGreaterThan(0);
          continue;
        }
        expect(check.path.length, `${task.id} has a check with an empty path`).toBeGreaterThan(0);
        if (check.type === "file-contains") {
          expect(check.text.length, `${task.id} checks ${check.path} for empty text`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("only compares files that were seeded", () => {
    for (const task of corpus.tasks) {
      for (const check of task.checks) {
        if (check.type !== "file-unchanged") continue;
        expect(task.files[check.path], `${task.id} compares unseeded ${check.path}`).toBeDefined();
      }
    }
  });

  it("seeds every file whose content a check inspects and the prompt does not create", () => {
    // A file check may legitimately target a file the agent must create. What it
    // must not do is inspect a path that neither exists at seed time nor is
    // named in the prompt: that reads as a failure no agent could avoid.
    for (const task of corpus.tasks) {
      for (const check of task.checks) {
        if (check.type === "command" || check.type === "file-missing") continue;
        if (task.files[check.path] !== undefined) continue;
        expect(
          task.prompt.includes(check.path),
          `${task.id} checks ${check.path}, which is neither seeded nor named in the prompt`,
        ).toBe(true);
      }
    }
  });

  it("tags every task so failures can be grouped by capability", () => {
    for (const task of corpus.tasks) {
      expect(task.tags.length, `${task.id} has no tags`).toBeGreaterThan(0);
    }
  });

  it("does not let a task ask for a file and forbid it in the same breath", () => {
    for (const task of corpus.tasks) {
      const forbidden = new Set(
        task.checks
          .filter((check) => check.type === "file-missing")
          .map((check) => (check as { path: string }).path),
      );
      const wanted = task.checks
        .filter((check) => check.type === "file-exists" || check.type === "file-contains")
        .map((check) => (check as { path: string }).path);
      for (const path of wanted) {
        expect(forbidden.has(path), `${task.id} both requires and forbids ${path}`).toBe(false);
      }
    }
  });
});

