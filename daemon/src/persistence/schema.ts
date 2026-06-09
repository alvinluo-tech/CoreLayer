import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ---- Workspaces ----

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default("Default Workspace"),
  description: text("description"),
  ownerId: text("owner_id").notNull(),
  settings: text("settings"), // JSON stored as text
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP").notNull(),
});

// ---- Projects ----

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status", { enum: ["active", "archived", "completed"] })
    .default("active")
    .notNull(),
  settings: text("settings"), // JSON stored as text
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP").notNull(),
});

// ---- Agent Profiles ----

export const agentProfiles = sqliteTable("agent_profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  modelPolicy: text("model_policy").notNull().default("{}"), // JSON: preferred_models, fallback
  executorPolicy: text("executor_policy"), // JSON: executor config
  skills: text("skills").notNull().default("[]"), // JSON array
  tools: text("tools").notNull().default("[]"), // JSON array
  knowledgeScopes: text("knowledge_scopes").notNull().default("[]"), // JSON array
  permissions: text("permissions").notNull().default("[]"), // JSON array
  memoryScopes: text("memory_scopes").notNull().default("[]"), // JSON array
  isDefault: integer("is_default", { mode: "boolean" }).default(false).notNull(),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP").notNull(),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  workspaceId: text("workspace_id").references(() => workspaces.id),
  projectId: text("project_id").references(() => projects.id),
  title: text("title").notNull(),
  description: text("description"),
  priority: integer("priority").default(3).notNull(), // 1-5, 1=highest
  status: text("status", {
    enum: ["draft", "queued", "running", "blocked", "failed", "completed", "cancelled", "pending", "in_progress", "done", "deleted"],
  })
    .default("pending")
    .notNull(),
  dueDate: text("due_date"), // ISO date
  tags: text("tags"), // JSON array stored as text
  completedAt: text("completed_at"), // ISO datetime
  objective: text("objective"),
  assignedAgentId: text("assigned_agent_id").references(() => agentProfiles.id),
  parentTaskId: text("parent_task_id"),
  dependencies: text("dependencies").default("[]"), // JSON array of task IDs
  blockedBy: text("blocked_by").default("[]"), // JSON array of task IDs
  acceptanceCriteria: text("acceptance_criteria").default("[]"), // JSON array
  artifacts: text("artifacts").default("[]"), // JSON array of artifact refs
  runHistory: text("run_history").default("[]"), // JSON array of run refs
  manualInterventionRequired: integer("manual_intervention_required", { mode: "boolean" }).default(false),
  rollbackPlan: text("rollback_plan"),
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
  workspaceId: text("workspace_id").references(() => workspaces.id),
  projectId: text("project_id").references(() => projects.id),
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
  parentMessageId: text("parent_message_id"),
  tokenCount: integer("token_count"),
  compressed: integer("compressed", { mode: "boolean" }).default(false).notNull(),
  modelUsed: text("model_used"),
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
  scopeType: text("scope_type", { enum: ["user", "workspace", "project", "agent", "task", "conversation"] }).notNull().default("user"),
  scopeId: text("scope_id"),
  type: text("type", { enum: ["fact", "preference", "context", "summary"] }).notNull(),
  tier: text("tier", { enum: ["preference", "context", "fact"] }).notNull().default("context"),
  key: text("key").notNull(),
  value: text("value").notNull(),
  source: text("source"),
  confidence: real("confidence"),
  uses: integer("uses").default(0).notNull(),
  lastInjectedAt: text("last_injected_at"),
  sourceRunId: text("source_run_id"),
  sourceMessageId: text("source_message_id"),
  lastVerifiedAt: text("last_verified_at"),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP").notNull(),
});

// ---- Scheduled Tasks (Cron) ----

export const scheduledTasks = sqliteTable("scheduled_tasks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  cronExpr: text("cron_expr").notNull(),
  prompt: text("prompt"),
  skillName: text("skill_name"),
  input: text("input"), // JSON stored as text
  enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
  lastRun: text("last_run"),
  nextRun: text("next_run"),
  lastResult: text("last_result"), // JSON stored as text
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP").notNull(),
});

// ---- Agent Runs ----

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id"),
  workspaceId: text("workspace_id").references(() => workspaces.id),
  projectId: text("project_id").references(() => projects.id),
  taskId: text("task_id"),
  agentId: text("agent_id").references(() => agentProfiles.id),
  userMessageId: text("user_message_id"),
  assistantMessageId: text("assistant_message_id"),
  status: text("status", { enum: ["queued", "running", "succeeded", "failed", "cancelled", "waiting_for_approval"] })
    .default("queued")
    .notNull(),
  mode: text("mode", { enum: ["chat", "voice", "tick", "scheduled", "workflow", "regenerate"] })
    .default("chat")
    .notNull(),
  selectedModel: text("selected_model"),
  routeReason: text("route_reason"),
  selectedTools: text("selected_tools").default("[]"), // JSON array
  memoryReads: text("memory_reads").default("[]"), // JSON array
  memoryWrites: text("memory_writes").default("[]"), // JSON array
  toolCalls: text("tool_calls").default("[]"), // JSON array of ToolCallTrace
  toolCallCount: integer("tool_call_count").default(0),
  artifacts: text("artifacts").default("[]"), // JSON array
  approvals: text("approvals").default("[]"), // JSON array
  startedAt: text("started_at").default("CURRENT_TIMESTAMP").notNull(),
  completedAt: text("completed_at"),
  durationMs: integer("duration_ms"),
  error: text("error"),
});

// ---- Agent Run Events ----

export const agentRunEvents = sqliteTable("agent_run_events", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => agentRuns.id),
  sequence: integer("sequence").notNull(),
  type: text("type").notNull(),
  payload: text("payload"), // JSON stored as text
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
});

// ---- Approval Requests ----

export const approvalRequests = sqliteTable("approval_requests", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => agentRuns.id),
  toolId: text("tool_id").notNull(),
  toolName: text("tool_name").notNull(),
  args: text("args").notNull(), // JSON stored as text
  risk: text("risk").notNull(),
  status: text("status", { enum: ["pending", "approved", "denied", "expired"] })
    .default("pending")
    .notNull(),
  projectScope: integer("project_scope", { mode: "boolean" }).default(false).notNull(),
  decidedAt: integer("decided_at"), // unix timestamp
  createdAt: integer("created_at").notNull(),
  mode: text("mode", { enum: ["chat", "voice", "tick", "scheduled", "workflow", "regenerate"] }).default("chat"),
  source: text("source"), // e.g. "mcp", "native", "skill"
  preview: text("preview"), // user-facing summary of what will change
  toolCallId: text("tool_call_id"), // for idempotent dedup
  expiresAt: integer("expires_at"), // unix timestamp, null = no expiry
  operationKind: text("operation_kind"), // e.g. "tool.execute" — for resume after approval
  operationPayload: text("operation_payload"), // JSON — serializable resume data
});

// ---- Permission Memories ----

export const permissionMemories = sqliteTable("permission_memories", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  projectId: text("project_id").references(() => projects.id),
  toolId: text("tool_id").notNull(),
  risk: text("risk").notNull(),
  decision: text("decision", { enum: ["auto", "confirm", "deny"] }).notNull(),
  scope: text("scope", { enum: ["global", "project", "session"] })
    .default("global")
    .notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at"), // unix timestamp, null = never
});

// ---- Persistent Goals ----

export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default("default"),
  description: text("description").notNull(),
  status: text("status", { enum: ["active", "paused", "completed", "abandoned"] })
    .default("active")
    .notNull(),
  progress: text("progress"), // JSON stored as text
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP").notNull(),
});

// ---- Event Log ----

export const eventLog = sqliteTable("event_log", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  projectId: text("project_id"),
  taskId: text("task_id"),
  agentRunId: text("agent_run_id"),
  runtimeId: text("runtime_id"),
  payload: text("payload"), // JSON stored as text
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
});

// ---- Audit Log ----

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  riskLevel: text("risk_level"),
  permissionDecision: text("permission_decision"),
  confirmedByUser: integer("confirmed_by_user", { mode: "boolean" }),
  result: text("result"),
  metadata: text("metadata"), // JSON stored as text
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
});
