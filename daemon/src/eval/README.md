# Coding-run eval harness

The harness is small tooling for questions that only measurement can answer:
does a prompt, policy, or adapter change make a coding agent **reliably** good,
or just occasionally lucky?

Run it against the live ACP adapter with a DeepSeek model. It is not part of
`pnpm test`; every check costs a real model turn.

```powershell
cd daemon
$env:ANTHROPIC_MODEL='deepseek-v4.1-flash'
$env:ANTHROPIC_BASE_URL='http://127.0.0.1:8791'
$env:ANTHROPIC_AUTH_TOKEN='sk-...'
npx tsx src/eval/cli.ts --corpus src/eval/corpora/core.json --k 3
```

## What it measures

- **pass^k** — the fraction of tasks that succeeded on _every_ attempt. This is
  the number that matters for an agent a user runs unattended, and it is
  strictly harder than pass@k: it collapses to the success rate when `k = 1`
  and rewards consistent tasks over lucky ones.
- **False positives / false negatives** — attempts where the executor claimed
  success but a check failed, or reported failure while the checks passed. Both
  count as failures; the counters exist to tell you _why_ the harness and the
  agent disagree.
- **Executor status** — `succeeded`, `failed`, `cancelled`, or `timed-out`. A
  run budget is applied twice, once by `acpx` and once by the harness, because
  a run that hangs in the agent process would otherwise never return. Whichever
  fires first wins.
- **Voided attempts** — an attempt whose failure is an environment fault (an
  exhausted quota, a refused connection, a provider 5xx) is reported as `VOID`
  and excluded from every rate. The classification comes from
  `workflow/failure-classification.ts`, the same one production runs use, so a
  quota outage cannot be reported as "the agent got worse". Three environment
  faults in a row stop the run: a gateway that answers `429` does so for every
  request until its quota resets, and continuing spends a full timeout per task
  to learn the same thing.

Two corpora ship with the harness: `core` (single-file work: write, edit, debug,
delete, rename) and `holdout` (multi-step coordination, byte-exact scope
discipline, restraint, and refusing to invent a fact). They are graded
separately so a change that helps one is not credited against the other.

## Baseline (2026-10-21, deepseek-v4.1-flash)

`core`, k = 3, six tasks, 18/18 attempts:

```
PASS  every task, every attempt   (24s–39s each)
pass^3 = 100.0%   false positives: 0   false negatives: 0
```

The first k=1 run had one failure: `rename-symbol` timed out at 181s. It passes
cleanly at ~30s once the gateway is healthy, so that was an environment fault.
A flapping gateway makes `acpx` hang until the run budget expires rather than
failing fast, so check the gateway before reading a timeout as a task the model
cannot do.

`holdout`, k = 1, after the spawn fix:

```
PASS  multi-step-migration 34s   PASS  preserve-untouched-file 29s   PASS  refuse-impossible 33s
PASS  no-op-request 26s   PASS  failing-command-honesty 44s   PASS  bounded-scope 29s
pass^1 = 100.0%   false positives: 0   false negatives: 0
```

Both corpora passing is the expected result for a capable model on tasks this
size, and it is only meaningful because of what it took to get there: the first
holdout run failed five of six tasks, which is how the prompt-truncation bug in
`process-spawner.ts` was found. The corpus is a regression detector, not a
scoreboard — the value is in the next change that turns a row red.

## Corpus format

A corpus is JSON validated by `corpus.ts`:

```json
{
  "name": "core",
  "attempts": 3,
  "tasks": [
    {
      "id": "write-readme",
      "title": "Create a README",
      "prompt": "Create README.md containing the project name.",
      "files": { "package.json": "{\"name\":\"demo\"}" },
      "checks": [{ "type": "file-contains", "path": "README.md", "text": "demo" }],
      "timeoutMs": 180000,
      "tags": ["write"]
    }
  ]
}
```

Each attempt gets a fresh temporary git repository seeded with the task's
`files` and one empty commit, so an executor that diffs against `HEAD` has a
base to compare to and tasks cannot contaminate each other.

### Checks

| type             | fields         | passes when                                   |
| ---------------- | -------------- | --------------------------------------------- |
| `file-exists`    | `path`         | the file exists                               |
| `file-missing`   | `path`         | the path does not exist                       |
| `file-contains`  | `path`, `text` | the file contains `text` verbatim             |
| `file-unchanged` | `path`         | the file is byte-identical to what was seeded |
| `command`        | `command`      | the command exits 0 in the workspace          |

`file-unchanged` compares digests, which is the only way to test "change nothing
else": `file-contains` still passes when a single substring survives a rewrite.

Set `"expectNoChange": true` on a negative task. The executor still runs — "do
nothing" includes not hanging — and the whole workspace is then compared with
the seed commit, so a scratch file counts as a change even if no check names it.

Command checks are shell pipelines (`cmd /c` on Windows, `sh -c` elsewhere), so
prefer `node check.js` over `grep`: a check that only runs on one platform
silently fails on the other. Avoid `node -e "<one-liner>"` as well: `cmd` splits
the command on the unescaped unquoted inner quotes a nested `-e` program needs,
and the resulting "Unterminated string constant" looks like a task failure. Seed
a small script file and run that.

Paths are resolved inside the workspace; absolute paths and `..` are rejected,
so a check can never inspect the host.

## Adding a task

Prefer checks that a deterministic script can decide. When content comparison is
awkward (formatting, ordering, prose), seed a `check.js` / `check.mjs` alongside
the task files and grade with a `command` check; that keeps the corpus portable
and the verdict reproducible.
