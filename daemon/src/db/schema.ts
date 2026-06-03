import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  priority: integer("priority").default(3).notNull(), // 1-5, 1=highest
  status: text("status", { enum: ["pending", "in_progress", "done", "deleted"] })
    .default("pending")
    .notNull(),
  dueDate: text("due_date"), // ISO date
  tags: text("tags"), // JSON array stored as text
  completedAt: text("completed_at"), // ISO datetime
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP").notNull(),
});

export const articles = sqliteTable("articles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  url: text("url"),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", { enum: ["unread", "reading", "finished"] })
    .default("unread")
    .notNull(),
  rating: integer("rating"), // 1-5
  notes: text("notes"),
  category: text("category"),
  addedAt: text("added_at").default("CURRENT_TIMESTAMP").notNull(),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
});

export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type", { enum: ["daily", "weekly"] }).notNull(),
  periodStart: text("period_start").notNull(), // ISO date
  periodEnd: text("period_end").notNull(), // ISO date
  taskCompletionRate: real("task_completion_rate"),
  articlesRead: integer("articles_read"),
  summary: text("summary"),
  patterns: text("patterns"), // JSON array stored as text
  suggestions: text("suggestions"), // JSON array stored as text
  rawData: text("raw_data"), // JSON object stored as text
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
});

// ---- Conversation Management ----

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default("default"),
  title: text("title").notNull().default("New Chat"),
  modelUsed: text("model_used").notNull().default("mimo-v2.5-pro"),
  messageCount: integer("message_count").notNull().default(0),
  promptTokens: integer("prompt_tokens").default(0),
  completionTokens: integer("completion_tokens").default(0),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP").notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "system", "tool"] }).notNull(),
  content: text("content").notNull().default(""),
  toolCalls: text("tool_calls"), // JSON array stored as text
  toolCallId: text("tool_call_id"),
  tokenCount: integer("token_count"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
});

// ---- Tool Call Audit Trail ----

export const toolCallLogs = sqliteTable("tool_call_logs", {
  id: text("id").primaryKey(),
  toolId: text("tool_id").notNull(),
  toolName: text("tool_name").notNull(),
  appId: text("app_id"),
  source: text("source", { enum: ["mcp", "native", "skill", "rest"] }).notNull(),
  args: text("args"), // JSON stored as text
  resultSuccess: integer("result_success", { mode: "boolean" }),
  resultData: text("result_data"), // JSON stored as text
  resultError: text("result_error"),
  risk: text("risk"),
  confirmedByUser: integer("confirmed_by_user", { mode: "boolean" }),
  durationMs: integer("duration_ms"),
  conversationId: text("conversation_id"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
});

// ---- Persisted MCP/App Connections ----

export const appConnections = sqliteTable("app_connections", {
  id: text("id").primaryKey(),
  appId: text("app_id").notNull().unique(),
  appName: text("app_name").notNull(),
  source: text("source", { enum: ["mcp", "native", "skill", "rest"] }).notNull(),
  config: text("config"), // JSON stored as text
  status: text("status", { enum: ["disconnected", "connecting", "connected", "error"] })
    .default("disconnected")
    .notNull(),
  lastConnected: text("last_connected"),
  lastError: text("last_error"),
  toolCount: integer("tool_count").default(0),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP").notNull(),
});

// ---- Model Profiles ----

export const modelProfiles = sqliteTable("model_profiles", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  modelName: text("model_name").notNull(),
  displayName: text("display_name"),
  capabilities: text("capabilities"), // JSON stored as text
  limits: text("limits"), // JSON stored as text
  cost: text("cost"), // JSON stored as text
  isDefault: integer("is_default", { mode: "boolean" }).default(false),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP").notNull(),
});

// ---- Agent Memory ----

export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default("default"),
  type: text("type", { enum: ["fact", "preference", "context", "summary"] }).notNull(),
  key: text("key").notNull(),
  value: text("value").notNull(),
  source: text("source"),
  confidence: real("confidence"),
  uses: integer("uses").default(0).notNull(),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP").notNull(),
});

// ---- Agent Runs ----

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id"),
  userMessageId: text("user_message_id"),
  assistantMessageId: text("assistant_message_id"),
  status: text("status", { enum: ["running", "succeeded", "failed", "cancelled"] })
    .default("running")
    .notNull(),
  selectedModel: text("selected_model"),
  routeReason: text("route_reason"),
  toolCallCount: integer("tool_call_count").default(0),
  startedAt: text("started_at").default("CURRENT_TIMESTAMP").notNull(),
  completedAt: text("completed_at"),
  durationMs: integer("duration_ms"),
  error: text("error"),
});
