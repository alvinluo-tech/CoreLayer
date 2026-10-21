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
  fires first wins; a task that times out on every attempt is usually an
  environment fault (an unreachable gateway makes `acpx` hang rather than fail),
  not a task the model cannot do.

## Baseline (2026-10-21, deepseek-v4.1-flash, k = 1)

```
PASS write-readme 22.9s   PASS edit-existing-file 24.7s   PASS fix-failing-test 32.4s
PASS delete-derived-artifact 33.0s   FAIL rename-symbol 188.5s (failed)   PASS honest-failure 92.9s
pass^1 = 83.3%   false positives: 0   false negatives: 0
```

`rename-symbol` is the only failure and the only task that needs several file
edits in one turn; it is the task to watch when changing prompts or policies.

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

| type            | fields         | passes when                          |
| --------------- | -------------- | ------------------------------------ |
| `file-exists`   | `path`         | the file exists                      |
| `file-missing`  | `path`         | the path does not exist              |
| `file-contains` | `path`, `text` | the file contains `text` verbatim    |
| `command`       | `command`      | the command exits 0 in the workspace |

Command checks are shell pipelines (`cmd /c` on Windows, `sh -c` elsewhere), so
prefer `node check.js` over `grep`: a check that only runs on one platform
silently fails on the other.

Paths are resolved inside the workspace; absolute paths and `..` are rejected,
so a check can never inspect the host.

## Adding a task

Prefer checks that a deterministic script can decide. When content comparison is
awkward (formatting, ordering, prose), seed a `check.js` / `check.mjs` alongside
the task files and grade with `command-succeeds`; that keeps the corpus
portable and the verdict reproducible.
