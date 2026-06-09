import { Hono } from "hono";
import { cors } from "hono/cors";
import { logError } from "../shared/errors.js";
import { env } from "../config/env.js";
import { resolveAppPaths } from "../config/app-paths.js";
import { getCurrentMode } from "../persistence/factory.js";
import { registerRoutes } from "./register-routes.js";
import { getRuntimeInstances } from "../runtime-host/registry.js";

export function createHttpApp(): Hono {
  const app = new Hono();

  app.use(
    "/*",
    cors({
      origin: (origin) => {
        if (!origin) return "http://localhost:1420";
        if (
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
          origin === "http://tauri.localhost" ||
          origin === "tauri://localhost"
        ) {
          return origin;
        }
        return "http://localhost:1420";
      },
    })
  );

  // Global error handler (safety net for any unhandled route exception)
  app.onError((err, c) => {
    logError("UnhandledRouteError", err);
    return c.json({ error: "Internal server error" }, 500);
  });

  // 404 handler
  app.notFound((c) => {
    return c.json({ error: "Route not found" }, 404);
  });

  app.get("/api/health", (c) => {
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      storageMode: getCurrentMode(),
      aiProvider: env.AI_PROVIDER,
      aiModel: env.AI_MODEL,
    });
  });

  app.get("/health", (c) => {
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      storageMode: getCurrentMode(),
      aiProvider: env.AI_PROVIDER,
      aiModel: env.AI_MODEL,
    });
  });

  // Runtime status & shutdown (for Tauri supervisor)
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
        status = runtimeStatus.health === "healthy" ? "running"
          : runtimeStatus.health === "degraded" ? "degraded"
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

  // Register all route groups
  registerRoutes(app);

  return app;
}
