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

const EXPECTED_CODING_ADAPTERS = [
  { id: "claude-code", displayName: "Claude Code", command: "claude" },
  { id: "codex", displayName: "Codex", command: "codex" },
  { id: "opencode", displayName: "OpenCode", command: "opencode" },
] as const;

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

const DRY_RUN_TIMEOUT_MS = 60_000;

interface AdapterDiagnostic {
  id: string;
  displayName: string;
  registered: boolean;
  available: boolean;
  version: string | null;
  reason: string | null;
  transport: string;
  executablePath: string | null;
  pathSource: "PATH";
  installHint: string;
}

/**
 * GET /coding/diagnostics — Run discover() on all registered adapters.
 */
app.get("/coding/diagnostics", async (c) => {
  const results: AdapterDiagnostic[] = [];

  try {
    const registered = new Map(listCodingRuntimes().map((adapter) => [adapter.id, adapter.name]));

    for (const expected of EXPECTED_CODING_ADAPTERS) {
      const adapter = getCodingRuntime(expected.id);
      const executablePath = getExecutablePath(expected.command);

      if (!adapter) {
        results.push({
          id: expected.id,
          displayName: expected.displayName,
          registered: false,
          available: false,
          version: null,
          reason: "Adapter is not registered in the Jarvis coding runtime registry.",
          transport: "cli",
          executablePath,
          pathSource: "PATH",
          installHint: INSTALL_HINTS[expected.id] ?? "",
        });
        continue;
      }

      try {
        const availability = await adapter.discover();
        results.push({
          id: expected.id,
          displayName: registered.get(expected.id) ?? expected.displayName,
          registered: true,
          available: availability.available,
          version: availability.version ?? null,
          reason: availability.reason ?? null,
          transport: availability.transport,
          executablePath,
          pathSource: "PATH",
          installHint: INSTALL_HINTS[expected.id] ?? "",
        });
      } catch (err) {
        results.push({
          id: expected.id,
          displayName: registered.get(expected.id) ?? expected.displayName,
          registered: true,
          available: false,
          version: null,
          reason: err instanceof Error ? err.message : String(err),
          transport: "cli",
          executablePath,
          pathSource: "PATH",
          installHint: INSTALL_HINTS[expected.id] ?? "",
        });
      }
    }

    return c.json({ adapters: results });
  } catch (err) {
    logError("runtimes/diagnostics", err);
    return c.json({
      adapters: EXPECTED_CODING_ADAPTERS.map((expected) => ({
        id: expected.id,
        displayName: expected.displayName,
        registered: false,
        available: false,
        version: null,
        reason: extractErrorMessage(err),
        transport: "cli",
        executablePath: getExecutablePath(expected.command),
        pathSource: "PATH",
        installHint: INSTALL_HINTS[expected.id] ?? "",
      })),
    });
  }
});

/**
 * GET /coding/diagnostics/health — Lightweight route/registry sanity check.
 */
app.get("/coding/diagnostics/health", async (c) => {
  try {
    const registered = listCodingRuntimes();
    return c.json({
      ok: true,
      daemonPid: process.pid,
      expectedAdapterCount: EXPECTED_CODING_ADAPTERS.length,
      registeredAdapterCount: registered.length,
      registeredAdapters: registered.map((adapter) => adapter.id),
      pathSource: "PATH",
    });
  } catch (err) {
    logError("runtimes/diagnostics-health", err);
    return c.json({
      ok: false,
      daemonPid: process.pid,
      expectedAdapterCount: EXPECTED_CODING_ADAPTERS.length,
      registeredAdapterCount: 0,
      registeredAdapters: [],
      pathSource: "PATH",
      error: extractErrorMessage(err),
    });
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

    const args =
      adapterId === "claude-code"
        ? ["--print", "--output-format", "text", "--no-session-persistence", prompt]
        : adapterId === "codex"
          ? [
              "exec",
              "--skip-git-repo-check",
              "--sandbox",
              "read-only",
              "--color",
              "never",
              prompt,
            ]
          : ["--prompt", prompt];

    const result = await spawnProcess({
      command: cliCommand,
      args,
      timeoutMs: DRY_RUN_TIMEOUT_MS,
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
