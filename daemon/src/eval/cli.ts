/**
 * `pnpm eval` — run a task corpus against one executor.
 *
 * Usage (from the daemon package):
 *   npx tsx src/eval/cli.ts --corpus src/eval/corpora/core.json
 *   npx tsx src/eval/cli.ts --corpus <file> --k 1 --only write-readme
 *   npx tsx src/eval/cli.ts --corpus <file> --json results.json
 *
 * The corpus path is required: there is no default, because running the wrong
 * corpus silently and reporting a number would be worse than having no command.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadCorpus } from "./corpus.js";
import { createAcpExecutor } from "./executors.js";
import { runCorpus, type AttemptRecord, type EvalRunResult } from "./runner.js";
import { formatReport } from "./reliability.js";

interface CliOptions {
  corpus: string;
  k?: number;
  only?: string[];
  jsonOut?: string;
  outputDir?: string;
  keepWorkspaces: boolean;
  model?: string;
}

export function parseArgs(argv: readonly string[]): CliOptions {
  const options: Partial<CliOptions> = { keepWorkspaces: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = (): string => {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      return value;
    };
    switch (arg) {
      case "--corpus":
        options.corpus = next();
        break;
      case "--k":
        options.k = Number(next());
        break;
      case "--only":
        options.only = next().split(",").map((id) => id.trim()).filter(Boolean);
        break;
      case "--json":
        options.jsonOut = next();
        break;
      case "--output-dir":
        options.outputDir = next();
        break;
      case "--model":
        options.model = next();
        break;
      case "--keep-workspaces":
        options.keepWorkspaces = true;
        break;
      case "--help":
      case "-h":
        throw new UsageError();
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!options.corpus) throw new Error("--corpus is required");
  if (options.k !== undefined && (!Number.isInteger(options.k) || options.k < 1)) {
    throw new Error("--k must be a positive integer");
  }
  return options as CliOptions;
}

export class UsageError extends Error {}

const USAGE = `Usage: tsx src/eval/cli.ts --corpus <file> [options]

  --corpus <file>        Task corpus JSON (required)
  --k <n>                Override attempts per task
  --only <ids>           Comma-separated task ids
  --model <id>           Model to pin (must pass the DeepSeek-only guard)
  --json <file>          Write the full result as JSON
  --output-dir <dir>     Keep attempt workspaces under this directory
  --keep-workspaces      Do not delete attempt workspaces
`;

async function main(): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stdout.write(USAGE);
      return 0;
    }
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
    return 2;
  }

  const corpus = loadCorpus(resolve(options.corpus));
  if (options.k !== undefined) corpus.attempts = options.k;

  const executor = createAcpExecutor({ model: options.model });
  process.stdout.write(
    `corpus: ${corpus.name}  tasks: ${corpus.tasks.length}  k: ${corpus.attempts}  executor: ${executor.name}\n\n`,
  );

  const result = await runCorpus(corpus, executor, {
    cleanup: !options.keepWorkspaces,
    ...(options.outputDir ? { outputDir: resolve(options.outputDir) } : {}),
    ...(options.only ? { only: options.only } : {}),
    onAttempt: printAttempt,
  });

  process.stdout.write(`\n${formatReport(result.reliability)}\n`);
  process.stdout.write(
    `\nfalse positives: ${result.falsePositives}  false negatives: ${result.falseNegatives}\n` +
      `(claimed success, task failed / reported failure, task passed)\n`,
  );

  if (options.jsonOut) {
    const target = resolve(options.jsonOut);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(serialise(result), null, 2), "utf-8");
    process.stdout.write(`\nresults written to ${target}\n`);
  }
  return 0;
}

function printAttempt(record: AttemptRecord): void {
  const outcome = record.passed ? "PASS" : "FAIL";
  const detail = record.passed
    ? ""
    : `  (${record.verdict.checks.filter((check) => !check.passed).map((check) => check.detail).join("; ")})`;
  process.stdout.write(
    `  ${outcome}  ${record.taskId} #${record.attempt}  executor=${record.executor}  ${record.durationMs}ms${detail}\n`,
  );
}

/** Keep workspace paths out of the report; they are ephemeral and machine-specific. */
function serialise(result: EvalRunResult): unknown {
  return {
    ...result,
    attempts: result.attempts.map(({ workspace, ...rest }) => rest),
  };
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exit(1);
  });
