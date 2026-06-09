/**
 * Runtimes route — agent runtime diagnostics and dry-run testing.
 *
 * GET  /api/runtimes/coding/diagnostics   — discover all adapters
 * POST /api/runtimes/coding/:id/dry-run   — spawn minimal test task
 */

import { Hono } from "hono";
import { apiError, extractErrorMessage, logError } from "../../shared/errors.js";
import { listCodingRuntimes, getCodingRuntime, getExecutablePath, spawnProcess } from "../../runtimes/coding/public-api.js";

const app = new Hono();

const INSTALL_HINTS: Record<string, string> = {
  "claude-code": "npm install -g @anthropic-ai/claude-code",
  codex: "npm install -g @openai/codex",
  opencode: "https://github.com/opencode-ai/opencode",
};

const DRY_RUN_PROMPTS: Record<string, string> = {
  "claude-code": "Reply with exactly: dry-run-ok",
  codex: "Reply with exactly: dry-run-ok",
  opencode: "Reply with exactly: dry-run-ok",
};

interface AdapterDiagnostic {
  id: string;
  displayName: string;
  available: boolean;
  version: string | null;
  reason: string | null;
  transport: string;
  executablePath: string | null;
  installHint: string;
}

/**
 * GET /coding/diagnostics — Run discover() on all registered adapters.
 */
app.get("/coding/diagnostics", async (c) => {
  try {
    const adapters = listCodingRuntimes();
    const results: AdapterDiagnostic[] = [];

    for (const { id, name } of adapters) {
      const adapter = getCodingRuntime(id);
      if (!adapter) continue;

      const cliCommand = id === "claude-code" ? "claude" : id === "codex" ? "codex" : "opencode";
      const executablePath = getExecutablePath(cliCommand);

      let availability: { available: boolean; version?: string; reason?: string; transport: string };
      try {
        availability = await adapter.discover();
      } catch (err) {
        availability = {
          available: false,
          reason: err instanceof Error ? err.message : String(err),
          transport: "cli",
        };
      }

      results.push({
        id,
        displayName: name,
        available: availability.available,
        version: availability.version ?? null,
        reason: availability.reason ?? null,
        transport: availability.transport,
        executablePath,
        installHint: INSTALL_HINTS[id] ?? "",
      });
    }

    return c.json({ adapters: results });
  } catch (err) {
    logError("runtimes/diagnostics", err);
    return apiError(c, extractErrorMessage(err));
  }
});

/**
 * POST /coding/:id/dry-run — Spawn a minimal test task with the given adapter.
 */
app.post("/coding/:id/dry-run", async (c) => {
  const adapterId = c.req.param("id");
  try {
    const adapter = getCodingRuntime(adapterId);
    if (!adapter) {
      return apiError(c, `Unknown adapter: ${adapterId}`, 404);
    }

    // Verify CLI is available before attempting dry-run
    const cliCommand = adapterId === "claude-code" ? "claude" : adapterId === "codex" ? "codex" : "opencode";
    const executablePath = getExecutablePath(cliCommand);
    if (!executablePath) {
      return apiError(c, `${cliCommand} not found on PATH. Install it first.`, 400);
    }

    const prompt = DRY_RUN_PROMPTS[adapterId] ?? "Reply with exactly: dry-run-ok";
    const startTime = Date.now();

    const result = await spawnProcess({
      command: cliCommand,
      args: adapterId === "claude-code" ? ["--print", prompt] : ["--prompt", prompt],
      timeoutMs: 10_000,
    });

    const durationMs = Date.now() - startTime;

    return c.json({
      success: result.exitCode === 0,
      durationMs,
      stdout: result.stdout.slice(0, 2000),
      stderr: result.stderr.slice(0, 2000),
      exitCode: result.exitCode,
    });
  } catch (err) {
    logError("runtimes/dry-run", err);
    return apiError(c, extractErrorMessage(err));
  }
});

export default app;
