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

// Seed default agent profiles if none exists
async function seedDefaultAgent() {
  try {
    const repos = getRepositories();
    const allProfiles = await repos.agentProfiles.getAll();

    // 1. Seed general Default Agent if no default agent exists
    const hasDefault = allProfiles.some((p) => p.isDefault);
    if (!hasDefault) {
      await repos.agentProfiles.create({
        name: "Jarvis",
        description: "The default general-purpose agent with standard tools and skills.",
        isDefault: true,
        role: "general",
        modelPolicy: { preferredModels: ["mimo-v2.5-pro"], fallbackModel: "mimo-v2.5" },
        executorPolicy: { executor: "self" },
        skills: [],
        tools: [],
        permissions: ["chat", "task_management"],
        memoryScopes: ["user"],
      });
      console.log("[Jarvis] Seeded default Jarvis agent profile");
    }

    // 2. Seed Planner Agent
    if (!allProfiles.some((p) => p.role === "planner")) {
      await repos.agentProfiles.create({
        name: "Planner Agent",
        description: "Analyzes requirements and designs specifications.",
        role: "planner",
        modelPolicy: { preferredModels: ["mimo-v2.5-pro"], fallbackModel: "mimo-v2.5" },
        executorPolicy: { executor: "self" },
        skills: ["requirements_analysis", "architecture_design"],
        tools: [],
        permissions: ["chat", "task_management"],
        memoryScopes: ["user", "workspace"],
      });
      console.log("[Jarvis] Seeded Planner Agent profile");
    }

    // 3. Seed Coding Agent
    if (!allProfiles.some((p) => p.role === "coding")) {
      await repos.agentProfiles.create({
        name: "Coding Agent",
        description: "Writes high-quality code and implements features using Claude Code.",
        role: "coding",
        modelPolicy: { preferredModels: ["mimo-v2.5-pro"], fallbackModel: "mimo-v2.5" },
        executorPolicy: { executor: "claude-code" },
        skills: ["code_implementation", "refactoring"],
        tools: [],
        permissions: ["chat", "task_management", "shell_exec", "file_write", "file_read"],
        memoryScopes: ["user", "workspace", "project"],
      });
      console.log("[Jarvis] Seeded Coding Agent profile");
    }

    // 4. Seed Testing Agent
    if (!allProfiles.some((p) => p.role === "testing")) {
      await repos.agentProfiles.create({
        name: "Testing Agent",
        description: "Writes unit and integration tests and runs test suites using Claude Code.",
        role: "testing",
        modelPolicy: { preferredModels: ["mimo-v2.5-pro"], fallbackModel: "mimo-v2.5" },
        executorPolicy: { executor: "claude-code" },
        skills: ["test_implementation", "bug_verification"],
        tools: [],
        permissions: ["chat", "task_management", "shell_exec", "file_write", "file_read"],
        memoryScopes: ["user", "workspace", "project"],
      });
      console.log("[Jarvis] Seeded Testing Agent profile");
    }

    // 5. Seed Review Agent
    if (!allProfiles.some((p) => p.role === "review")) {
      await repos.agentProfiles.create({
        name: "Review Agent",
        description: "Reviews code changes and architectural consistency.",
        role: "review",
        modelPolicy: { preferredModels: ["mimo-v2.5-pro"], fallbackModel: "mimo-v2.5" },
        executorPolicy: { executor: "self" },
        skills: ["code_review", "quality_audit"],
        tools: [],
        permissions: ["chat", "task_management"],
        memoryScopes: ["user", "workspace", "project"],
      });
      console.log("[Jarvis] Seeded Review Agent profile");
    }

    // 6. Seed Research Agent
    if (!allProfiles.some((p) => p.role === "research")) {
      await repos.agentProfiles.create({
        name: "Research Agent",
        description: "Researches technical details, libraries, and best practices.",
        role: "research",
        modelPolicy: { preferredModels: ["mimo-v2.5-pro"], fallbackModel: "mimo-v2.5" },
        executorPolicy: { executor: "self" },
        skills: ["technical_research", "web_search"],
        tools: [],
        permissions: ["chat", "task_management", "file_read"],
        memoryScopes: ["user", "workspace"],
      });
      console.log("[Jarvis] Seeded Research Agent profile");
    }
  } catch (err) {
    console.error("[Jarvis] Failed to seed agent profiles:", err);
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
