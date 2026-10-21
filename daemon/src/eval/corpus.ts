/**
 * Task corpus for the agent eval harness.
 *
 * A task is a self-contained unit of work with an observable acceptance
 * condition. It is deliberately *not* a prompt alone: a prompt plus "did the
 * agent say it succeeded" measures the agent's confidence, not its work.
 *
 * The corpus is plain JSON so a task can be reviewed in a diff and added
 * without touching code. Every field that affects a verdict is explicit; the
 * runner refuses a task it cannot judge.
 */

import { readFileSync, existsSync } from "node:fs";
import { z } from "zod";

export const evalTaskSchema = z
  .object({
    /** Stable id; reported in results and used for diffing runs. */
    id: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, "id must be lower-kebab-case"),
    /** One line describing what the task asks for. */
    title: z.string().min(1),
    /** The prompt handed to the executor. */
    prompt: z.string().min(1),
    /**
     * Files seeded into the workspace before the agent runs. Paths are
     * relative to the workspace root; parents are created as needed.
     */
    files: z.record(z.string()).default({}),
    /**
     * Acceptance checks. At least one is required: a task nobody can judge
     * would silently count as a pass.
     */
    checks: z
      .array(
        z.discriminatedUnion("type", [
          z.object({ type: z.literal("file-exists"), path: z.string().min(1) }),
          z.object({ type: z.literal("file-contains"), path: z.string().min(1), text: z.string().min(1) }),
          z.object({ type: z.literal("file-missing"), path: z.string().min(1) }),
          z.object({ type: z.literal("command"), command: z.string().min(1) }),
        ]),
      )
      .min(1),
    /** Wall-clock budget for one attempt. */
    timeoutMs: z.number().int().positive().default(180_000),
    /** Tags for grouping results by capability area. */
    tags: z.array(z.string()).default([]),
  })
  .refine(
    (task) => Object.keys(task.files).every((path) => !path.startsWith("/") && !path.includes("..")),
    { message: "seed file paths must be relative and must not traverse upward" },
  );

export type EvalTask = z.infer<typeof evalTaskSchema>;

export const evalCorpusSchema = z.object({
  /** Corpus name, reported with results. */
  name: z.string().min(1),
  /**
   * How many attempts per task. pass^k is only meaningful over independent
   * rollouts of the same task, so a corpus that runs each task once cannot
   * report reliability.
   */
  attempts: z.number().int().min(1).max(10).default(3),
  tasks: z.array(evalTaskSchema).min(1),
});

export type EvalCorpus = z.infer<typeof evalCorpusSchema>;

export function parseCorpus(raw: unknown): EvalCorpus {
  const parsed = evalCorpusSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid eval corpus: ${issues}`);
  }
  const ids = new Set<string>();
  for (const task of parsed.data.tasks) {
    if (ids.has(task.id)) throw new Error(`Invalid eval corpus: duplicate task id '${task.id}'`);
    ids.add(task.id);
  }
  return parsed.data;
}

export function loadCorpus(path: string): EvalCorpus {
  if (!existsSync(path)) throw new Error(`Eval corpus not found: ${path}`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch (error) {
    throw new Error(`Eval corpus is not valid JSON (${path}): ${error instanceof Error ? error.message : error}`);
  }
  return parseCorpus(raw);
}
