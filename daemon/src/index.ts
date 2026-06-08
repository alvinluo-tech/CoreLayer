import { serve } from "@hono/node-server";
import { env } from "./config/env.js";
import { resolveAppPaths } from "./config/app-paths.js";
import { initializeRepositories, getCurrentMode, getRepositories } from "./persistence/factory.js";
import { getStorageMode } from "./config/storage-config.js";
import { runMigration } from "./config/migration.js";
import { configManager } from "./config/config-manager.js";
import { registerAllTools } from "./bootstrap/register-tools.js";
import { createHttpApp } from "./bootstrap/create-http-app.js";
import { startRuntimeHost } from "./bootstrap/start-runtime-host.js";
import { startBackgroundServices } from "./bootstrap/start-background-services.js";

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
registerAllTools();

// Seed default agent profile if none exists
async function seedDefaultAgent() {
  try {
    const repos = getRepositories();
    const existing = await repos.agentProfiles.getDefault();
    if (!existing) {
      await repos.agentProfiles.create({
        name: "Default Agent",
        description: "The default general-purpose agent with standard tools and skills.",
        isDefault: true,
        modelPolicy: { preferredModels: ["mimo-v2.5-pro"], fallbackModel: "mimo-v2.5" },
        skills: [],
        tools: [],
        permissions: ["chat", "task_management"],
        memoryScopes: ["user"],
      });
      console.log("[Jarvis] Seeded default agent profile");
    }
  } catch (err) {
    console.error("[Jarvis] Failed to seed default agent:", err);
  }
}
seedDefaultAgent();

// Create HTTP app
const app = createHttpApp();

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

    const shutdown = async (signal: string) => {
      console.log(`[Jarvis] Received ${signal}, shutting down gracefully...`);
      server.close();
      try {
        const { disconnectAllMCPServers } = await import("./gateways/mcp/client.js");
        await disconnectAllMCPServers();
      } catch { /* best-effort MCP cleanup */ }
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

// Start all managed runtime instances
startRuntimeHost().catch((err) => console.error("[Jarvis] Runtime startup failed:", err));

// Emit daemon startup event
getRepositories().eventLog.create({
  type: "daemon.startup",
  payload: { port: env.DAEMON_PORT, host: effectiveHost, storageMode: getCurrentMode(), runtimeMode: env.JARVIS_RUNTIME_MODE },
}).catch((err: unknown) => console.error("[Jarvis] Failed to log startup event:", err));

// Auto-connect saved MCP servers after server starts
import("./gateways/mcp/client.js")
  .then(({ autoConnectMCPServers }) => autoConnectMCPServers())
  .catch((err) => console.error("[Jarvis] MCP auto-connect failed:", err));

// Start background services (scheduler, sensors)
startBackgroundServices().catch((err) => console.error("[Jarvis] Background services startup failed:", err));
