/**
 * Judging one attempt of an eval task.
 *
 * A check answers a question about the workspace after the agent stopped, not
 * about what the agent said. File checks read the workspace; command checks run
 * a shell command inside it with the same shell the verification layer uses.
 *
 * Every check that cannot be evaluated (a missing file, a command that will not
 * start) is a failure, never a skip: an unjudgeable task must not inflate a
 * reliability number.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, normalize, resolve } from "node:path";
import type { EvalTask } from "./corpus.js";
import { spawnProcess } from "../runtimes/coding/public-api.js";

export interface CheckResult {
  kind: EvalTask["checks"][number]["type"];
  passed: boolean;
  detail: string;
}

export interface AttemptVerdict {
  passed: boolean;
  checks: CheckResult[];
}

const COMMAND_TIMEOUT_MS = 60_000;

export async function judgeAttempt(
  task: EvalTask,
  workspace: string,
  options: { commandTimeoutMs?: number } = {},
): Promise<AttemptVerdict> {
  const checks: CheckResult[] = [];
  for (const check of task.checks) {
    checks.push(await runCheck(check, workspace, options.commandTimeoutMs ?? COMMAND_TIMEOUT_MS));
  }
  return { passed: checks.every((check) => check.passed), checks };
}

async function runCheck(
  check: EvalTask["checks"][number],
  workspace: string,
  commandTimeoutMs: number,
): Promise<CheckResult> {
  switch (check.type) {
    case "file-exists": {
      const path = safeResolve(workspace, check.path);
      if (!path) return { kind: check.type, passed: false, detail: `path escapes workspace: ${check.path}` };
      const exists = existsSync(path);
      return {
        kind: check.type,
        passed: exists && statSync(path).isFile(),
        detail: exists ? `${check.path} exists` : `${check.path} is missing`,
      };
    }

    case "file-missing": {
      const path = safeResolve(workspace, check.path);
      if (!path) return { kind: check.type, passed: false, detail: `path escapes workspace: ${check.path}` };
      return {
        kind: check.type,
        passed: !existsSync(path),
        detail: existsSync(path) ? `${check.path} should not exist` : `${check.path} is absent as required`,
      };
    }

    case "file-contains": {
      const path = safeResolve(workspace, check.path);
      if (!path) return { kind: check.type, passed: false, detail: `path escapes workspace: ${check.path}` };
      if (!existsSync(path)) return { kind: check.type, passed: false, detail: `${check.path} is missing` };
      const content = readFileSync(path, "utf-8");
      const found = content.includes(check.text);
      return {
        kind: check.type,
        passed: found,
        detail: found ? `${check.path} contains the expected text` : `${check.path} does not contain ${JSON.stringify(check.text)}`,
      };
    }

    case "command": {
      const isWindows = process.platform === "win32";
      const result = await spawnProcess({
        command: isWindows ? "cmd" : "sh",
        args: isWindows ? ["/c", check.command] : ["-c", check.command],
        cwd: workspace,
        timeoutMs: commandTimeoutMs,
      });
      return {
        kind: check.type,
        passed: result.exitCode === 0,
        detail:
          result.exitCode === 0
            ? `${check.command} exited 0`
            : `${check.command} exited ${result.exitCode}: ${result.stderr.slice(0, 200)}`,
      };
    }
  }
}

/**
 * Resolve a check path inside the workspace.
 *
 * A check that names `../x` would judge a file the agent was never asked to
 * touch, so it is refused rather than resolved.
 */
function safeResolve(workspace: string, relative: string): string | null {
  if (isAbsolute(relative)) return null;
  const normalized = normalize(relative);
  if (normalized.startsWith("..")) return null;
  const root = resolve(workspace);
  const target = resolve(join(root, normalized));
  return target === root || target.startsWith(`${root}${process.platform === "win32" ? "\\" : "/"}`)
    ? target
    : null;
}
