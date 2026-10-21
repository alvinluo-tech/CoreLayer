/**
 * Eval runner: execute a corpus against one executor and record pass^k.
 *
 * Each attempt gets its own throwaway git repository so attempts are genuinely
 * independent — a second attempt must not inherit the first one's files, its
 * branch, or its partial work. The workspace is created, seeded, committed, run
 * and removed inside the attempt.
 *
 * The runner deliberately reports the executor's own status alongside the
 * judged outcome. They disagree often enough to be worth measuring: an
 * executor that reports `succeeded` on a task whose checks fail is a prompt or
 * harness problem, while one that reports `failed` on a task whose checks pass
 * is an observability problem.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSyncBuffered } from "../runtimes/coding/public-api.js";
import type { EvalCorpus, EvalTask } from "./corpus.js";
import { judgeAttempt, type AttemptVerdict } from "./judge.js";
import {
  summarizeReliability,
  type ReliabilityReport,
  type TaskAttempts,
} from "./reliability.js";

/** What one executor attempt reported, independent of whether the task passed. */
export type ExecutorStatus = "succeeded" | "failed" | "cancelled" | "timed-out";

export interface ExecutorRunResult {
  status: ExecutorStatus;
  error?: string;
  /** Anything the executor produced that is worth keeping in the report. */
  artifacts?: string[];
}

export interface EvalExecutor {
  /** Stable name for the report, e.g. "acp:deepseek-v4.1-flash". */
  readonly name: string;
  run(task: EvalTask, workspace: string, signal: AbortSignal): Promise<ExecutorRunResult>;
}

export interface AttemptRecord {
  taskId: string;
  attempt: number;
  passed: boolean;
  executor: ExecutorStatus;
  verdict: AttemptVerdict;
  executorError?: string;
  workspace: string;
  durationMs: number;
}

export interface EvalRunResult {
  corpus: string;
  executor: string;
  startedAt: string;
  finishedAt: string;
  attempts: AttemptRecord[];
  reliability: ReliabilityReport;
  /** Attempts where the executor claimed success but the task did not pass. */
  falsePositives: number;
  /** Attempts where the executor reported failure but every check passed. */
  falseNegatives: number;
}

export interface RunOptions {
  /** Directory that receives per-attempt workspace snapshots. Default: temp. */
  outputDir?: string;
  /** Remove attempt workspaces after judging. Default true. */
  cleanup?: boolean;
  /** Called after each attempt, for live progress. */
  onAttempt?: (record: AttemptRecord) => void;
  /** Restrict a run to a subset of task ids. */
  only?: string[];
  /** Abort the whole run. */
  signal?: AbortSignal;
}

export async function runCorpus(
  corpus: EvalCorpus,
  executor: EvalExecutor,
  options: RunOptions = {},
): Promise<EvalRunResult> {
  const startedAt = new Date().toISOString();
  const attempts: AttemptRecord[] = [];
  const only = options.only && options.only.length > 0 ? new Set(options.only) : null;

  for (const task of corpus.tasks) {
    if (only && !only.has(task.id)) continue;
    for (let attempt = 1; attempt <= corpus.attempts; attempt += 1) {
      if (options.signal?.aborted) break;
      const record = await runAttempt(task, attempt, executor, options);
      attempts.push(record);
      options.onAttempt?.(record);
    }
  }

  const grouped: TaskAttempts[] = corpus.tasks
    .filter((task) => !only || only.has(task.id))
    .map((task) => ({
      taskId: task.id,
      tags: task.tags,
      outcomes: attempts.filter((record) => record.taskId === task.id).map((record) => record.passed),
    }));

  return {
    corpus: corpus.name,
    executor: executor.name,
    startedAt,
    finishedAt: new Date().toISOString(),
    attempts,
    reliability: summarizeReliability(grouped, corpus.attempts),
    falsePositives: attempts.filter((record) => record.executor === "succeeded" && !record.passed).length,
    falseNegatives: attempts.filter((record) => record.executor !== "succeeded" && record.passed).length,
  };
}

async function runAttempt(
  task: EvalTask,
  attempt: number,
  executor: EvalExecutor,
  options: RunOptions,
): Promise<AttemptRecord> {
  const started = Date.now();
  const workspace = createWorkspace(task, options.outputDir);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), task.timeoutMs);

  let executorResult: ExecutorRunResult;
  try {
    executorResult = await executor.run(task, workspace, controller.signal);
  } catch (error) {
    executorResult = {
      status: controller.signal.aborted ? "timed-out" : "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }

  const verdict = await judgeAttempt(task, workspace);
  const record: AttemptRecord = {
    taskId: task.id,
    attempt,
    passed: verdict.passed,
    executor: executorResult.status,
    verdict,
    ...(executorResult.error ? { executorError: executorResult.error } : {}),
    workspace,
    durationMs: Date.now() - started,
  };

  if (options.cleanup !== false) {
    removeWorkspace(workspace);
  }
  return record;
}

/**
 * Build an isolated repository for one attempt.
 *
 * A git repository (rather than a bare directory) because every executor path
 * assumes one: the worktree environment needs a base commit and the change
 * collection reads `git status`.
 */
function createWorkspace(task: EvalTask, outputDir?: string): string {
  const root = outputDir ? join(outputDir, task.id) : tmpdir();
  mkdirSync(root, { recursive: true });
  const workspace = mkdtempSync(join(root, "attempt-"));
  seedFiles(workspace, task.files);
  initRepository(workspace);
  return workspace;
}

function seedFiles(workspace: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const target = join(workspace, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, "utf-8");
  }
}

function initRepository(workspace: string): void {
  const git = (args: string[]): void => {
    // Throws on a non-zero exit: a workspace that failed to initialise would
    // otherwise be judged (and reported as a task failure) instead of surfacing
    // as a harness fault.
    execFileSyncBuffered("git", args, { cwd: workspace });
  };
  git(["init", "-q"]);
  // Repository-local identity: a global one may be absent on CI, and without it
  // the seed commit fails and every attempt runs against an unversioned tree.
  git(["config", "user.email", "eval@jarvis.local"]);
  git(["config", "user.name", "Jarvis Eval"]);
  git(["add", "-A"]);
  // A seed-only commit would fail on a task with no files; the empty tree is a
  // valid base and keeps every workspace shaped the same way.
  git(["commit", "-q", "--allow-empty", "-m", "eval seed"]);
}

function removeWorkspace(workspace: string): void {
  try {
    rmSync(workspace, { recursive: true, force: true });
  } catch {
    // Windows can hold a handle briefly; the directory is disposable.
  }
}
