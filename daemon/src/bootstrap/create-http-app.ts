import { Hono } from "hono";
import { cors } from "hono/cors";
import { logError } from "../shared/errors.js";
import { env } from "../config/env.js";
import { resolveAppPaths } from "../config/app-paths.js";
import { getCurrentMode } from "../persistence/factory.js";
import { registerRoutes } from "./register-routes.js";

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
  app.get("/api/runtime/status", (c) => {
    const paths = resolveAppPaths();
    return c.json({
      status: "ok",
      runtimeMode: env.JARVIS_RUNTIME_MODE,
      pid: process.pid,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      storageMode: getCurrentMode(),
      paths: {
        appDataDir: paths.appDataDir,
        sqlitePath: paths.sqlitePath,
        logDir: paths.logDir,
      },
    });
  });

  // Register all route groups
  registerRoutes(app);

  return app;
}
