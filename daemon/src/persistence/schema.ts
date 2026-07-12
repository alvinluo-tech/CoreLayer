import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

// ---- Workspaces ----

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default("Default Workspace"),
  description: text("description"),
  ownerId: text("owner_id").notNull(),
  goal: text("goal"), // User's original goal description
  status: text("status", {
    enum: ["draft", "planning", "running", "blocked", "succeeded", "failed", "cancelled"],
  })
    .default("draft")
    .notNull(),
  activeProjectId: text("active_project_id"),
  completedAt: text("completed_at"),
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
  spec: text("spec"),
  techStack: text("tech_stack"),
  rootPath: text("root_path"),
  status: text("status", { enum: ["active", "archived", "completed"] })
    .default("active")
    .notNull(),
  settings: text("settings"), // JSON stored as text
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP").notNull(),
});

// ---- Workspace Agents (agent-to-workspace relationship) ----

export const workspaceAgents = sqliteTable("workspace_agents", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  agentProfileId: text("agent_profile_id")
    .notNull()
    .references(() => agentProfiles.id, { onDelete: "cascade" }),
  roleInWorkspace: text("role_in_workspace", {
    enum: ["owner", "planner", "builder", "reviewer", "tester", "observer"],
  })
    .default("builder")
    .notNull(),
  status: text("status", {
    enum: ["idle", "running", "completed", "failed", "blocked"],
  })
    .default("idle")
    .notNull(),
  currentTaskId: text("current_task_id"),
  joinedAt: text("joined_at").default("CURRENT_TIMESTAMP").notNull(),
  leftAt: text("left_at"),
});

// ---- Artifacts ----

export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => projects.id),
  taskId: text("task_id"),
  runId: text("run_id"),
  type: text("type", { enum: ["spec", "plan", "file", "report", "scaffold"] }).notNull(),
  title: text("title").notNull(),
  path: text("path"),
  content: text("content"),
  metadata: text("metadata"), // JSON stored as text
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
});

// ---- Agent Profiles ----

export const agentProfiles = sqliteTable("agent_profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  role: text("role", { enum: ["general", "planner", "coding", "review", "testing", "research"] })
    .default("general")
    .notNull(),
  capabilities: text("capabilities").notNull().default("[]"), // JSON array: ["file_write", "shell_exec", "code_review"]
  enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
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
}, (t) => [
  index("conversations_updated_at_idx").on(t.updatedAt),
]);

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
  tier: text("tier", { enum: ["preference", "context", "fact", "pinned"] }).notNull().default("context"),
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

// ---- Pending Actions ----

export const pendingActions = sqliteTable("pending_actions", {
  id: text("id").primaryKey(),
  approvalRequestId: text("approval_request_id").notNull(),
  runId: text("run_id").notNull(),
  executorRunId: text("executor_run_id"),
  workspaceId: text("workspace_id"),
  projectId: text("project_id"),
  taskId: text("task_id"),
  actionFingerprint: text("action_fingerprint").notNull(),
  actionPayload: text("action_payload").notNull(), // JSON RuntimeAction or operation payload
  resumePayload: text("resume_payload").notNull(), // JSON resume strategy payload
  status: text("status", {
    enum: ["blocked", "approved", "resuming", "executing", "completed", "failed", "cancelled", "expired"],
  })
    .default("blocked")
    .notNull(),
  error: text("error"),
  result: text("result"), // JSON cached result for idempotent resume
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP").notNull(),
  completedAt: text("completed_at"),
});

// ---- Capability Grants ----

export const capabilityGrants = sqliteTable("capability_grants", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id"),
  projectId: text("project_id"),
  taskId: text("task_id"),
  runId: text("run_id"),
  agentId: text("agent_id"),
  executorId: text("executor_id"),
  profile: text("profile", {
    enum: [
      "read_only",
      "workspace_write",
      "coding_standard",
      "dependency_install",
      "network_read",
      "network_write",
      "git_remote_write",
      "system_admin",
    ],
  }).notNull(),
  actions: text("actions").notNull().default("[]"), // JSON array of RuntimeActionType
  resources: text("resources").notNull().default("[]"), // JSON array of resource patterns
  constraints: text("constraints").default("{}"), // JSON
  status: text("status", { enum: ["active", "revoked", "expired", "consumed"] })
    .default("active")
    .notNull(),
  createdBy: text("created_by").notNull().default("system"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
  expiresAt: text("expires_at"),
  revokedAt: text("revoked_at"),
});

// ---- Execution Logs ----

export const executionLogs = sqliteTable("execution_logs", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  executorRunId: text("executor_run_id"),
  workspaceId: text("workspace_id"),
  projectId: text("project_id"),
  taskId: text("task_id"),
  stream: text("stream", { enum: ["stdout", "stderr", "system", "executor"] }).notNull(),
  sequence: integer("sequence").notNull(),
  content: text("content").notNull(),
  metadata: text("metadata"), // JSON stored as text
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
});

// ---- Environment Sessions ----

export const environmentSessions = sqliteTable("environment_sessions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => projects.id),
  runId: text("run_id"),
  agentId: text("agent_id").references(() => agentProfiles.id),
  environmentKind: text("environment_kind").notNull(), // git-worktree, browser-session, canvas, message-draft, etc.
  state: text("state", {
    enum: ["created", "preparing", "ready", "active", "paused", "completed", "failed", "disposed"],
  })
    .default("created")
    .notNull(),
  workingDirectory: text("working_directory"),
  accessPolicy: text("access_policy").default("{}"), // JSON stored as text
  metadata: text("metadata").default("{}"), // JSON stored as text
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP").notNull(),
});

// ---- Environment Events ----

export const environmentEvents = sqliteTable("environment_events", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => environmentSessions.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  type: text("type").notNull(),
  payload: text("payload"), // JSON stored as text
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
});

// ---- Executor Runs ----

export const executorRuns = sqliteTable("executor_runs", {
  id: text("id").primaryKey(),
  agentRunId: text("agent_run_id").references(() => agentRuns.id),
  workspaceId: text("workspace_id").references(() => workspaces.id),
  projectId: text("project_id").references(() => projects.id),
  taskId: text("task_id"),
  agentId: text("agent_id").references(() => agentProfiles.id),
  adapterId: text("adapter_id").notNull(),
  attemptNumber: integer("attempt_number").notNull().default(1),
  nativeSessionId: text("native_session_id"),
  nativeTurnId: text("native_turn_id"),
  eventCursor: integer("event_cursor").notNull().default(0),
  heartbeatAt: text("heartbeat_at"),
  leaseOwner: text("lease_owner"),
  leaseExpiresAt: text("lease_expires_at"),
  domain: text("domain").notNull().default("coding"), // coding, research, image-generation, messaging, etc.
  status: text("status", {
    enum: [
      "created",
      "queued",
      "preparing_environment",
      "waiting_for_permission",
      "starting_executor",
      "running",
      "waiting_for_executor_input",
      "collecting_artifacts",
      "verifying",
      "needs_retry",
      "succeeded",
      "failed",
      "cancelled",
      "timed_out",
      "cleanup_failed",
    ],
  })
    .default("created")
    .notNull(),
  taskPrompt: text("task_prompt").notNull(),
  environmentKind: text("environment_kind").notNull().default("local"), // git-worktree, browser-session, canvas, etc.
  environmentConfig: text("environment_config").default("{}"), // JSON: domain-specific environment config
  workingDirectory: text("working_directory"), // primary working directory
  pid: integer("pid"),
  exitCode: integer("exit_code"),
  error: text("error"),
  failureCategory: text("failure_category"),
  timeoutMs: integer("timeout_ms"),
  artifacts: text("artifacts").default("{}"), // JSON stored as text
  startedAt: text("started_at").default("CURRENT_TIMESTAMP").notNull(),
  completedAt: text("completed_at"),
  durationMs: integer("duration_ms"),
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
  agentSnapshot: text("agent_snapshot"), // immutable resolved AgentProfile JSON
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
  status: text("status", { enum: ["pending", "approved", "denied", "expired", "executing", "succeeded", "failed"] })
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
  runId: text("run_id"), // ties session-scoped memories to a specific run
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

// ---- Persistent Plans ----

export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(),
  goalId: text("goal_id").references(() => goals.id),
  workspaceId: text("workspace_id").references(() => workspaces.id),
  version: integer("version").notNull().default(1),
  strategy: text("strategy").notNull(), // Human-readable plan description
  taskCount: integer("task_count").notNull().default(0),
  status: text("status", { enum: ["draft", "active", "completed", "superseded"] })
    .default("draft")
    .notNull(),
  metadata: text("metadata").default("{}"), // JSON stored as text
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

// ---- Channel Accounts ----

export const channelAccounts = sqliteTable("channel_accounts", {
  id: text("id").primaryKey(),
  channelType: text("channel_type").notNull(),
  displayName: text("display_name").notNull(),
  config: text("config").notNull().default("{}"),
  enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP").notNull(),
});

// ---- Channel Conversations ----

export const channelConversations = sqliteTable(
  "channel_conversations",
  {
    id: text("id").primaryKey(),
    channelAccountId: text("channel_account_id")
      .notNull()
      .references(() => channelAccounts.id, { onDelete: "cascade" }),
    platformConversationId: text("platform_conversation_id").notNull(),
    jarvisConversationId: text("jarvis_conversation_id").notNull(),
    workspaceId: text("workspace_id"),
    platformUserMetadata: text("platform_user_metadata").notNull().default("{}"),
    createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
    updatedAt: text("updated_at").default("CURRENT_TIMESTAMP").notNull(),
  },
  (t) => [
    index("idx_channel_conv_account").on(t.channelAccountId),
    index("idx_channel_conv_platform").on(t.channelAccountId, t.platformConversationId),
    index("idx_channel_conv_jarvis").on(t.jarvisConversationId),
  ],
);

// ---- Channel Messages ----

export const channelMessages = sqliteTable(
  "channel_messages",
  {
    id: text("id").primaryKey(),
    channelConversationId: text("channel_conversation_id")
      .notNull()
      .references(() => channelConversations.id, { onDelete: "cascade" }),
    direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
    content: text("content").notNull(),
    platformMessageId: text("platform_message_id"),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
  },
  (t) => [
    index("idx_channel_msg_conv").on(t.channelConversationId),
    index("idx_channel_msg_created").on(t.createdAt),
  ],
);
