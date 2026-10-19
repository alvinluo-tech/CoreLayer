/**
 * Live ACP integration test.
 *
 * Drives the real acpx + claude-agent-acp stack against the configured
 * Anthropic-compatible endpoint. Excluded from `pnpm test` (see
 * vitest.config.ts) because it needs a working model credential.
 *
 * Requires:
 * - ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN for a DeepSeek-compatible proxy
 * - ANTHROPIC_MODEL beginning with "deepseek"
 *
 * Run with:
 *   cd daemon && npx vitest run --config vitest.config.ts src/__e2e__/acp-live.e2e.test.ts
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { AcpCodingAdapter } from "../runtimes/coding/adapters/acp/adapter.js";
import { validateClaudeModel } from "../runtimes/coding/adapters/acp/model-guard.js";

const model = process.env.ANTHROPIC_MODEL ?? "";
const hasCredentials = Boolean(process.env.ANTHROPIC_BASE_URL && process.env.ANTHROPIC_AUTH_TOKEN);
const canRun = hasCredentials && validateClaudeModel(model).allowed;

function makeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "jarvis-acp-live-"));
  writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "acp-live", private: true }), "utf-8");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["config", "user.email", "e2e@local"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "E2E"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: repo });
  return repo;
}

describe.skipIf(!canRun)("ACP live run", () => {
  it("writes a file through Claude Code over ACP and reports evidence", async () => {
    const repo = makeRepo();
    const adapter = new AcpCodingAdapter();

    try {
      const runId = "acp-live-1";
      const handle = await adapter.startRun({
        dbRunId: runId,
        repoPath: repo,
        taskPrompt: "Create a file named PROOF.md containing exactly: ACP-LIVE-OK",
        executorModel: model,
        permissionPolicy: "normal",
        timeoutMs: 180_000,
      });
      expect(handle.status).not.toBe("failed");

      // The stream helper yields in 500ms windows, so poll until the run settles.
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        const status = await adapter.getRunStatus(runId);
        if (status.status !== "running" && status.status !== "pending") break;
        // Drain whatever arrived in this window.
        for await (const _event of adapter.streamRunEvents(runId)) {
          // consumed for side effects only
        }
      }

      const status = await adapter.getRunStatus(runId);
      expect(status.status).toBe("succeeded");
      expect(status.error).toBeUndefined();

      const artifacts = await adapter.collectArtifacts(runId);
      expect(artifacts.map((a) => a.type)).toContain("final_summary");
      expect(artifacts.map((a) => a.type)).toContain("changed_files");

      const porcelain = execFileSync("git", ["status", "--porcelain"], { cwd: repo }).toString();
      expect(porcelain).toContain("PROOF.md");
    } finally {
      try {
        rmSync(repo, { recursive: true, force: true });
      } catch {
        // Windows can hold the worktree briefly; the temp dir is disposable.
      }
    }
  }, 240_000);
});
