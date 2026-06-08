/**
 * Unit tests for the daemon status payload.
 *
 * Verifies the GET /api/runtime/status endpoint returns all expected fields
 * with correct types and structure.
 *
 * The status endpoint is defined inline in create-http-app.ts. We build a
 * minimal Hono app that mounts the same handler to avoid pulling in the full
 * transitive dependency tree (register-routes, persistence client, etc.).
 */

import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

// Mock only the direct dependencies of the status endpoint handler
vi.mock("../../../config/env.js", () => ({
  env: {
    JARVIS_RUNTIME_MODE: "dev",
    DAEMON_PORT: 1420,
    AI_PROVIDER: "mimo",
    AI_MODEL: "mimo-v2.5-pro",
  },
}));

vi.mock("../../../config/app-paths.js", () => ({
  resolveAppPaths: () => ({
    appDataDir: "/home/user/.jarvis",
    configDir: "/home/user/.jarvis/config",
    dataDir: "/home/user/.jarvis/data",
    logDir: "/home/user/.jarvis/logs",
    sqlitePath: "/home/user/.jarvis/data/jarvis.db",
  }),
}));

vi.mock("../../../persistence/factory.js", () => ({
  getCurrentMode: () => "local",
}));

vi.mock("../../../runtime-host/registry.js", () => ({
  getRuntimeInstances: () => new Map(),
}));

// Import mocks after vi.mock calls
import { env } from "../../../config/env.js";
import { resolveAppPaths } from "../../../config/app-paths.js";
import { getCurrentMode } from "../../../persistence/factory.js";
import { getRuntimeInstances } from "../../../runtime-host/registry.js";

/**
 * Build a minimal test app with the /api/runtime/status handler,
 * replicating the inline handler from create-http-app.ts.
 */
function buildTestApp(): Hono {
  const app = new Hono();

  app.get("/api/runtime/status", async (c) => {
    const paths = resolveAppPaths();
    const instances = getRuntimeInstances();
    const registeredRuntimes: Array<{
      kind: string;
      status: string;
      lastError?: string;
    }> = [];

    for (const [kind, runtime] of instances) {
      let status = "unknown";
      let lastError: string | undefined;
      try {
        const runtimeStatus = await runtime.getStatus();
        status =
          runtimeStatus.health === "healthy"
            ? "running"
            : runtimeStatus.health === "degraded"
              ? "degraded"
              : "failed";
        lastError = runtimeStatus.lastError;
      } catch (err) {
        status = "failed";
        lastError = err instanceof Error ? err.message : String(err);
      }
      registeredRuntimes.push({ kind, status, lastError });
    }

    return c.json({
      status: "ok",
      runtimeMode: env.JARVIS_RUNTIME_MODE,
      pid: process.pid,
      selectedPort: env.DAEMON_PORT,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      storageMode: getCurrentMode(),
      paths: {
        appDataDir: paths.appDataDir,
        sqlitePath: paths.sqlitePath,
        logDir: paths.logDir,
      },
      registeredRuntimes,
    });
  });

  return app;
}

const app = buildTestApp();

describe("GET /api/runtime/status", () => {
  it("returns 200 with status ok", async () => {
    const res = await app.request("/api/runtime/status");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("returns all expected top-level fields", async () => {
    const res = await app.request("/api/runtime/status");
    const body = await res.json();

    expect(body).toHaveProperty("runtimeMode");
    expect(body).toHaveProperty("pid");
    expect(body).toHaveProperty("selectedPort");
    expect(body).toHaveProperty("uptime");
    expect(body).toHaveProperty("memoryUsage");
    expect(body).toHaveProperty("storageMode");
    expect(body).toHaveProperty("paths");
    expect(body).toHaveProperty("registeredRuntimes");
  });

  it("returns runtimeMode as a string", async () => {
    const res = await app.request("/api/runtime/status");
    const body = await res.json();

    expect(typeof body.runtimeMode).toBe("string");
    expect(body.runtimeMode).toBe("dev");
  });

  it("returns pid as a positive number", async () => {
    const res = await app.request("/api/runtime/status");
    const body = await res.json();

    expect(typeof body.pid).toBe("number");
    expect(body.pid).toBeGreaterThan(0);
  });

  it("returns selectedPort as a number", async () => {
    const res = await app.request("/api/runtime/status");
    const body = await res.json();

    expect(typeof body.selectedPort).toBe("number");
  });

  it("returns paths with appDataDir, sqlitePath, and logDir", async () => {
    const res = await app.request("/api/runtime/status");
    const body = await res.json();

    expect(body.paths).toBeDefined();
    expect(typeof body.paths.appDataDir).toBe("string");
    expect(typeof body.paths.sqlitePath).toBe("string");
    expect(typeof body.paths.logDir).toBe("string");
  });

  it("returns memoryUsage with rss, heapUsed, and heapTotal", async () => {
    const res = await app.request("/api/runtime/status");
    const body = await res.json();

    expect(body.memoryUsage).toBeDefined();
    expect(typeof body.memoryUsage.rss).toBe("number");
    expect(typeof body.memoryUsage.heapUsed).toBe("number");
    expect(typeof body.memoryUsage.heapTotal).toBe("number");
    expect(body.memoryUsage.rss).toBeGreaterThan(0);
    expect(body.memoryUsage.heapUsed).toBeGreaterThan(0);
    expect(body.memoryUsage.heapTotal).toBeGreaterThan(0);
  });

  it("returns uptime as a number >= 0", async () => {
    const res = await app.request("/api/runtime/status");
    const body = await res.json();

    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it("returns registeredRuntimes as an array", async () => {
    const res = await app.request("/api/runtime/status");
    const body = await res.json();

    expect(Array.isArray(body.registeredRuntimes)).toBe(true);
  });

  it("returns storageMode as a string", async () => {
    const res = await app.request("/api/runtime/status");
    const body = await res.json();

    expect(typeof body.storageMode).toBe("string");
    expect(body.storageMode).toBe("local");
  });
});
