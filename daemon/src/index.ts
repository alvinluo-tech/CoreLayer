import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./config/env.js";
import { resolveAppPaths } from "./config/app-paths.js";
import { initializeRepositories, getCurrentMode, getRepositories } from "./db/factory.js";
import { getStorageMode } from "./config/storage-config.js";
import { runMigration } from "./config/migration.js";
import { configManager } from "./config/config-manager.js";
import { registerTodoTools } from "./tools/todo/connector.js";
import { registerReadingTools } from "./tools/reading/connector.js";
import { registerReviewTools } from "./tools/review/connector.js";
import { registerConversationTools } from "./tools/conversation/connector.js";
import { registerMemoryTools } from "./tools/memory/connector.js";
import { logError } from "./utils/errors.js";
import { registerAllAdapters } from "./mcp/adapters/index.js";
import type { RuntimeComponent, RuntimeComponentKind } from "./runtime-host/contract.js";
import { ALL_RUNTIME_KINDS } from "./runtime-host/contract.js";
import { getRuntimeInstances, startAllRuntimes } from "./runtime-host/index.js";
import conversationRoutes from "./api/conversations.js";
import taskRoutes from "./api/tasks.js";
import articleRoutes from "./api/articles.js";
import reviewRoutes from "./api/reviews.js";
import settingsRoutes from "./api/settings.js";
import chatRoutes from "./api/chat.js";
import voiceRoutes from "./api/voice.js";
import mcpRoutes from "./api/mcp.js";
import toolRoutes from "./api/tools.js";
import scheduledTaskRoutes from "./api/scheduled-tasks.js";
import approvalRoutes from "./api/approval.js";
import workspaceRoutes from "./api/workspaces.js";
import projectRoutes from "./api/projects.js";
import runsRoutes from "./api/runs.js";
import memoryRoutes from "./api/memories.js";
import agentProfileRoutes from "./api/agent-profiles.js";
import eventRoutes from "./api/events.js";
import auditRoutes from "./api/audit.js";
import { startScheduler, setIdleCallback, consolidateOnIdle } from "./scheduler.js";
import { registerDefaultReportSchedules } from "./reports/generator.js";
import { registerSensor, startSensors, setSensorChangeHandler } from "./sensors/registry.js";
import { createTodoSensor } from "./sensors/todo-sensor.js";
import { createReadingSensor } from "./sensors/reading-sensor.js";

// ─── Security helpers ────────────────────────────────────────────────────────
function isLoopback(addr: string): boolean {
  // Strip IPv6-mapped IPv4 prefix
  const clean = addr.replace(/^::ffff:/, "");
  return clean === "127.0.0.1" || clean === "::1" || clean === "localhost";
}

// Sidecar mode must not bind to 0.0.0.0 — enforce loopback-only
let effectiveHost = env.DAEMON_HOST;
if (env.JARVIS_RUNTIME_MODE === "sidecar" && effectiveHost !== "127.0.0.1" && effectiveHost !== "localhost") {
  console.error(
    `[Jarvis] SECURITY: sidecar mode must bind to 127.0.0.1, got DAEMON_HOST="${effectiveHost}". Falling back to 127.0.0.1.`
  );
  effectiveHost = "127.0.0.1";
}

// Run config migration from old locations to ~/.jarvis/
runMigration();

// Initialize storage mode and repositories
const storageMode = getStorageMode();
initializeRepositories(storageMode);

// Register all tool connectors
registerTodoTools();
registerReadingTools();
registerReviewTools();
registerConversationTools();
registerMemoryTools();
registerAllAdapters();

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

// ─── Global error handler (safety net for any unhandled route exception) ─────
app.onError((err, c) => {
  logError("UnhandledRouteError", err);
  return c.json({ error: "Internal server error" }, 500);
});

// ─── 404 handler ─────────────────────────────────────────────────────────────
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

// ─── Runtime status & shutdown (for Tauri supervisor) ─────────────────────────
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

app.get("/api/runtime/components", async (c) => {
  const paths = resolveAppPaths();
  const instances = getRuntimeInstances();
  const components: RuntimeComponent[] = await Promise.all(
    ALL_RUNTIME_KINDS.map(async (kind: RuntimeComponentKind) => {
      const runtime = instances.get(kind);
      let status: RuntimeComponent["status"] = "pending";
      let lastError: string | undefined;

      if (runtime) {
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
      }

      return {
        kind,
        status,
        pid: runtime ? process.pid : undefined,
        healthUrl: "/health",
        logPath: paths.logDir,
        restartPolicy: { type: "maxAttempts" as const, maxAttempts: 3 },
        lastError,
      };
    })
  );
  return c.json({ components });
});

app.post("/api/runtime/shutdown", async (c) => {
  // Only allow shutdown from loopback (127.0.0.1 / ::1)
  const incoming = (c.env as Record<string, unknown>)?.incoming as
    | { socket?: { remoteAddress?: string } }
    | undefined;
  const peerAddress = incoming?.socket?.remoteAddress;
  if (peerAddress && !isLoopback(peerAddress)) {
    return c.json({ error: "Shutdown only allowed from loopback" }, 403);
  }
  console.log("[Jarvis] Shutdown requested via API");
  // Give the response time to send before exiting
  setTimeout(() => process.exit(0), 200);
  return c.json({ status: "shutting_down" });
});

// Chat routes (streaming + non-streaming)
app.route("/api/chat", chatRoutes);

// Conversation management routes
app.route("/api/conversations", conversationRoutes);

// Task, Article, Review routes
app.route("/api/tasks", taskRoutes);
app.route("/api/articles", articleRoutes);
app.route("/api/reviews", reviewRoutes);

// Settings routes
app.route("/api/settings", settingsRoutes);

// Voice routes (ASR/TTS)
app.route("/api/voice", voiceRoutes);

// MCP routes (MCP server management, tools, resources, prompts)
app.route("/api/mcp", mcpRoutes);

// Unified tool registry routes
app.route("/api/tools", toolRoutes);

// Scheduled task routes
app.route("/api/tasks/scheduled", scheduledTaskRoutes);

// Approval Inbox routes (Phase 4)
app.route("/api/approvals", approvalRoutes);

// Workspace & Project routes (Phase 5)
app.route("/api/workspaces", workspaceRoutes);
app.route("/api/projects", projectRoutes);
app.route("/api/runs", runsRoutes);
app.route("/api/memories", memoryRoutes);
app.route("/api/agent-profiles", agentProfileRoutes);
app.route("/api/events", eventRoutes);
app.route("/api/audit", auditRoutes);

function startServer(port: number, hostname: string) {
  try {
    const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
      console.log(`Jarvis Daemon running on http://localhost:${info.port}`);
    }).on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.error(`Port ${port} already in use. Kill the existing process first.`);
        process.exit(1);
      } else {
        console.error("Server error:", err);
        process.exit(1);
      }
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`[Jarvis] Received ${signal}, shutting down gracefully...`);
      server.close();
      try {
        const { disconnectAllMCPServers } = await import("./mcp/client.js");
        await disconnectAllMCPServers();
      } catch {}
      process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

// Show configuration on startup
const activeProvider = configManager.getActiveProvider();
const activeModel = configManager.getActiveModel();
const creds = configManager.getCredentials();
const aiConfigured = Boolean(Object.values(creds).some((v) => v));
const aiMode = aiConfigured ? `AI 模式 (${activeProvider}/${activeModel})` : "本地模式 (无 API Key)";
console.log(`[Jarvis] AI: ${aiMode}`);
console.log(`[Jarvis] 存储: ${getCurrentMode()}`);
console.log(`[Jarvis] 数据库: ${resolveAppPaths().sqlitePath}`);

startServer(env.DAEMON_PORT, effectiveHost);

// Start all managed runtime instances (lifecycle/status init only, no autonomous loops)
startAllRuntimes().catch((err) => console.error("[Jarvis] Runtime startup failed:", err));

// Emit daemon startup event
getRepositories().eventLog.create({
  type: "daemon.startup",
  payload: { port: env.DAEMON_PORT, host: effectiveHost, storageMode: getCurrentMode(), runtimeMode: env.JARVIS_RUNTIME_MODE },
}).catch((err: unknown) => console.error("[Jarvis] Failed to log startup event:", err));

// Auto-connect saved MCP servers after server starts
import("./mcp/client.js")
  .then(({ autoConnectMCPServers }) => autoConnectMCPServers())
  .catch((err) => console.error("[Jarvis] MCP auto-connect failed:", err));

// Start scheduler and register default report schedules
startScheduler()
  .then(() => registerDefaultReportSchedules())
  .catch((err) => console.error("[Jarvis] Scheduler startup failed:", err));

// Register idle consolidation callback
setIdleCallback(consolidateOnIdle);

// Register and start sensors for proactive memory updates
setSensorChangeHandler((event) => {
  console.info(`[Sensor:${event.sensorName}] Change detected:`, event.changes.map((c) => c.detail).join("; "));
});
registerSensor(createTodoSensor());
registerSensor(createReadingSensor());
startSensors();
