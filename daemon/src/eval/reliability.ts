/**
 * Reliability statistics for the eval harness.
 *
 * The metric is pass^k (tau-bench): the probability that *all* k attempts on a
 * task succeed, estimated per task and averaged over the corpus. pass@k — "at
 * least one of k succeeded" — flatters a system that is occasionally brilliant
 * and usually wrong, which is the opposite of what a desktop agent operating
 * unattended needs.
 *
 * With k = 1 the two coincide; with k > 1 they diverge sharply. A task at 80%
 * per-attempt success has a pass^3 near 51%, not 99%.
 */

export interface TaskAttempts {
  taskId: string;
  /** One boolean per independent attempt, in run order. */
  outcomes: boolean[];
  tags?: string[];
}

export interface TaskReliability {
  taskId: string;
  attempts: number;
  successes: number;
  /** Per-attempt success rate. */
  passRate: number;
  /** 1 when every attempt succeeded, 0 otherwise. */
  passAll: number;
  tags: string[];
}

export interface ReliabilityReport {
  /** Number of attempts requested per task (k). */
  k: number;
  tasks: TaskReliability[];
  /** Unweighted mean of per-attempt success rates. */
  meanPassRate: number;
  /**
   * Unweighted mean of pass^k. With k = 1 this equals `meanPassRate`.
   * Reported as `passAll` averaged over tasks, which is the reliability figure.
   */
  meanPassAll: number;
  /** Per-tag means, for locating which capability area is unreliable. */
  byTag: Record<string, { tasks: number; meanPassRate: number; meanPassAll: number }>;
}

export function summarizeReliability(results: readonly TaskAttempts[], k = 3): ReliabilityReport {
  if (k < 1) throw new Error(`k must be at least 1, received ${k}`);

  const tasks: TaskReliability[] = results.map((result) => {
    const attempts = result.outcomes.length;
    const successes = result.outcomes.filter(Boolean).length;
    // pass^k is the probability that all k attempts succeed.
    //   k = 1  -> the per-attempt outcome, so a 1-of-2 task reads 0.5 here and
    //             pass^k collapses to the per-attempt rate as it should;
    //   k > 1  -> a task recorded over fewer than k attempts cannot claim
    //             reliability, and one recorded over more must have passed them
    //             all.
    const passAll =
      k === 1
        ? successes / Math.max(attempts, 1)
        : attempts < k
          ? 0
          : successes === attempts
            ? 1
            : 0;
    return {
      taskId: result.taskId,
      attempts,
      successes,
      passRate: attempts === 0 ? 0 : successes / attempts,
      passAll,
      tags: result.tags ?? [],
    };
  });

  const mean = (values: number[]): number =>
    values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

  const byTagAccumulator = new Map<string, { rates: number[]; alls: number[] }>();
  for (const task of tasks) {
    for (const tag of task.tags) {
      const bucket = byTagAccumulator.get(tag) ?? { rates: [], alls: [] };
      bucket.rates.push(task.passRate);
      bucket.alls.push(task.passAll);
      byTagAccumulator.set(tag, bucket);
    }
  }

  const byTag: ReliabilityReport["byTag"] = {};
  for (const [tag, bucket] of byTagAccumulator) {
    byTag[tag] = {
      tasks: bucket.rates.length,
      meanPassRate: mean(bucket.rates),
      meanPassAll: mean(bucket.alls),
    };
  }

  return {
    k,
    tasks,
    meanPassRate: mean(tasks.map((task) => task.passRate)),
    meanPassAll: mean(tasks.map((task) => task.passAll)),
    byTag,
  };
}

/**
 * Whether a candidate run is at least as good as a baseline on both a point
 * estimate and its reliability.
 *
 * The tolerance exists because a corpus of a few dozen tasks is noisy; without
 * it every run would "regress" from sampling alone. It is deliberately not a
 * significance test — the corpus is too small to support one — so a result
 * inside the band should be reported as "no detectable change", not as a win.
 */
export function compareRuns(
  baseline: ReliabilityReport,
  candidate: ReliabilityReport,
  tolerance = 0.05,
): { verdict: "improved" | "regressed" | "unchanged"; passRateDelta: number; passAllDelta: number } {
  const passRateDelta = candidate.meanPassRate - baseline.meanPassRate;
  const passAllDelta = candidate.meanPassAll - baseline.meanPassAll;

  if (passRateDelta < -tolerance || passAllDelta < -tolerance) {
    return { verdict: "regressed", passRateDelta, passAllDelta };
  }
  if (passRateDelta > tolerance || passAllDelta > tolerance) {
    return { verdict: "improved", passRateDelta, passAllDelta };
  }
  return { verdict: "unchanged", passRateDelta, passAllDelta };
}

export function formatReport(report: ReliabilityReport): string {
  const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;
  const lines = [
    `pass^${report.k} = ${percent(report.meanPassAll)}   per-attempt = ${percent(report.meanPassRate)}`,
    "",
    `tasks: ${report.tasks.length}`,
  ];

  const failing = report.tasks.filter((task) => task.passAll === 0);
  if (failing.length > 0) {
    lines.push(`unreliable (${failing.length}):`);
    for (const task of failing) {
      lines.push(`  ${task.taskId}  ${task.successes}/${task.attempts}`);
    }
  }

  const reliable = report.tasks.filter((task) => task.passAll === 1);
  if (reliable.length > 0) {
    lines.push(`reliable (${reliable.length}): ${reliable.map((task) => task.taskId).join(", ")}`);
  }
  return lines.join("\n");
}
