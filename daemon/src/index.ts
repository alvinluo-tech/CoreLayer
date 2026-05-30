import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./config/env.js";
import { initializeRepositories, getCurrentMode } from "./db/factory.js";
import { getStorageMode } from "./config/storage-config.js";
import { registerTodoTools } from "./tools/todo/connector.js";
import { registerReadingTools } from "./tools/reading/connector.js";
import { registerReviewTools } from "./tools/review/connector.js";
import { logError } from "./utils/errors.js";
import { registerAllAdapters } from "./mcp/adapters/index.js";
import conversationRoutes from "./api/conversations.js";
import taskRoutes from "./api/tasks.js";
import articleRoutes from "./api/articles.js";
import reviewRoutes from "./api/reviews.js";
import settingsRoutes from "./api/settings.js";
import chatRoutes from "./api/chat.js";
import voiceRoutes from "./api/voice.js";
import mcpRoutes from "./api/mcp.js";
import toolRoutes from "./api/tools.js";

// Initialize storage mode and repositories
const storageMode = getStorageMode();
initializeRepositories(storageMode);

// Register all tool connectors
registerTodoTools();
registerReadingTools();
registerReviewTools();
registerAllAdapters();

const app = new Hono();

app.use("/*", cors());

// ─── Global error handler (safety net for any unhandled route exception) ─────
app.onError((err, c) => {
  logError("UnhandledRouteError", err);
  const message = err instanceof Error ? err.message : "Internal server error";
  return c.json({ error: message }, 500);
});

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.notFound((c) => {
  return c.json({ error: `Route not found: ${c.req.method} ${c.req.path}` }, 404);
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

function startServer(port: number) {
  try {
    serve({ fetch: app.fetch, port }, (info) => {
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
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

// Show configuration on startup
const aiConfigured = Boolean(env.MIMO_API_KEY || env.GROQ_API_KEY || env.OPENROUTER_API_KEY);
const aiMode = aiConfigured ? `AI 模式 (${env.AI_PROVIDER}/${env.AI_MODEL})` : "本地模式 (无 API Key)";
console.log(`[Jarvis] AI: ${aiMode}`);
console.log(`[Jarvis] 存储: ${getCurrentMode()}`);
console.log(`[Jarvis] 数据库: ${env.SQLITE_DB_PATH}`);

startServer(env.DAEMON_PORT);
