// Repository interfaces for storage abstraction
// Both SQLite and Supabase implementations conform to these interfaces

// ---- Row Types (normalized, no storage-specific types leak through) ----

export interface TaskRow {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  priority: number;
  status:
    | "draft"
    | "queued"
    | "running"
    | "blocked"
    | "failed"
    | "completed"
    | "cancelled"
    | "pending"
    | "in_progress"
    | "done"
    | "deleted";
  dueDate: string | null;
  tags: string[] | null;
  completedAt: string | null;
  objective: string | null;
  assignedAgentId: string | null;
  parentTaskId: string | null;
  dependencies: string[];
  blockedBy: string[];
  acceptanceCriteria: string[];
  artifacts: unknown[];
  runHistory: unknown[];
  manualInterventionRequired: boolean;
  rollbackPlan: string | null;
  workspaceId: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ArticleRow {
  id: string;
  userId: string;
  url: string | null;
  title: string;
  description: string | null;
  status: "unread" | "reading" | "finished";
  rating: number | null;
  notes: string | null;
  category: string | null;
  addedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ReviewRow {
  id: string;
  userId: string;
  type: "daily" | "weekly";
  periodStart: string;
  periodEnd: string;
  taskCompletionRate: number | null;
  articlesRead: number | null;
  summary: string | null;
  patterns: string[] | null;
  suggestions: string[] | null;
  rawData: unknown | null;
  createdAt: string;
}

export interface ConversationRow {
  id: string;
  userId: string;
  workspaceId: string | null;
  projectId: string | null;
  title: string;
  modelUsed: string;
  messageCount: number;
  promptTokens: number;
  completionTokens: number;
  createdAt: string;
  updatedAt: string;
}

export interface MessageRow {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls: string | null;
  toolCallId: string | null;
  parentMessageId: string | null;
  tokenCount: number | null;
  compressed: boolean;
  modelUsed?: string | null;
  createdAt: string;
}

// ---- Input Types ----

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: number;
  dueDate?: string;
  tags?: string[];
  objective?: string;
  assignedAgentId?: string;
  parentTaskId?: string;
  dependencies?: string[];
  acceptanceCriteria?: string[];
  rollbackPlan?: string;
}

export interface TaskFilters {
  status?: string;
  priority?: number;
  dueDateFrom?: string;
  dueDateTo?: string;
  projectId?: string;
}

export interface UpdateTaskData {
  title?: string;
  priority?: number;
  status?: string;
  dueDate?: string;
  tags?: string[];
  completedAt?: string;
  objective?: string;
  assignedAgentId?: string;
  parentTaskId?: string;
  dependencies?: string[];
  blockedBy?: string[];
  acceptanceCriteria?: string[];
  artifacts?: unknown[];
  runHistory?: unknown[];
  manualInterventionRequired?: boolean;
  rollbackPlan?: string;
}

export interface CreateArticleInput {
  title: string;
  url?: string;
  description?: string;
  category?: string;
}

export interface ArticleFilters {
  status?: string;
  category?: string;
  limit?: number;
}

export interface UpdateArticleData {
  status?: string;
  rating?: number;
  notes?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface SaveReviewInput {
  type: "daily" | "weekly";
  summary: string;
  patterns: string[];
  suggestions?: string[];
}

export interface DailySummaryResult {
  tasksCompleted: number;
  tasksTotal: number;
  completionRate: number;
  articlesRead: number;
  highlights: string[];
}

export interface WeeklyStatsResult {
  tasksCompleted: number;
  tasksTotal: number;
  completionRate: number;
  dailyBreakdown: { date: string; completed: number; total: number }[];
  articlesFinished: number;
  topTags: { tag: string; count: number }[];
}

export interface MessageInput {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: string;
  toolCallId?: string;
  parentMessageId?: string;
  tokenCount?: number;
  modelUsed?: string | null;
}

export interface MessageTreeNode {
  message: MessageRow;
  children: MessageTreeNode[];
}

export interface SearchResult {
  message: MessageRow;
  conversationTitle: string;
  snippet: string;
}

// ---- Row Types: New Tables ----

export interface ToolCallLogRow {
  id: string;
  toolId: string;
  toolName: string;
  appId: string | null;
  source: "mcp" | "native" | "skill" | "rest";
  args: unknown | null;
  resultSuccess: boolean | null;
  resultData: unknown | null;
  resultError: string | null;
  risk: string | null;
  confirmedByUser: boolean | null;
  durationMs: number | null;
  conversationId: string | null;
  createdAt: string;
}

export interface AppConnectionRow {
  id: string;
  appId: string;
  appName: string;
  source: "mcp" | "native" | "skill" | "rest";
  config: unknown | null;
  status: "disconnected" | "connecting" | "connected" | "error";
  lastConnected: string | null;
  lastError: string | null;
  toolCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ModelProfileRow {
  id: string;
  provider: string;
  modelName: string;
  displayName: string | null;
  capabilities: unknown | null;
  limits: unknown | null;
  cost: unknown | null;
  isDefault: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryRow {
  id: string;
  userId: string;
  scopeType: "user" | "workspace" | "project" | "agent" | "task" | "conversation";
  scopeId: string | null;
  type: "fact" | "preference" | "context" | "summary";
  tier: "preference" | "context" | "fact";
  key: string;
  value: string;
  source: string | null;
  confidence: number | null;
  uses: number;
  lastInjectedAt: string | null;
  sourceRunId: string | null;
  sourceMessageId: string | null;
  lastVerifiedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRunRow {
  id: string;
  conversationId: string | null;
  workspaceId: string | null;
  projectId: string | null;
  taskId: string | null;
  agentId: string | null;
  userMessageId: string | null;
  assistantMessageId: string | null;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "waiting_for_approval";
  mode: "chat" | "voice" | "tick" | "scheduled" | "workflow" | "regenerate";
  selectedModel: string | null;
  routeReason: string | null;
  selectedTools: string[] | null;
  memoryReads: string[] | null;
  memoryWrites: string[] | null;
  toolCalls: unknown[] | null;
  toolCallCount: number | null;
  artifacts: unknown[] | null;
  approvals: unknown[] | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
}

// ---- Repository Interfaces ----

export interface TaskRepository {
  create(input: CreateTaskInput): Promise<TaskRow>;
  query(filters?: TaskFilters): Promise<TaskRow[]>;
  getById(id: string): Promise<TaskRow | null>;
  update(id: string, data: UpdateTaskData): Promise<TaskRow>;
  delete(id: string): Promise<boolean>;
  getTodayTasks(): Promise<TaskRow[]>;
  getByProjectId(projectId: string): Promise<TaskRow[]>;
  getByParentId(parentTaskId: string): Promise<TaskRow[]>;
  clear(): Promise<number>;
}

export interface ArticleRepository {
  create(input: CreateArticleInput): Promise<ArticleRow>;
  list(filters?: ArticleFilters): Promise<ArticleRow[]>;
  getById(id: string): Promise<ArticleRow | null>;
  update(id: string, data: UpdateArticleData): Promise<ArticleRow>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<number>;
}

export interface ReviewRepository {
  save(input: SaveReviewInput): Promise<ReviewRow>;
  getHistory(type: "daily" | "weekly", limit?: number): Promise<ReviewRow[]>;
  getDailySummary(date?: string): Promise<DailySummaryResult>;
  getWeeklyStats(weekStart?: string): Promise<WeeklyStatsResult>;
}

export interface ConversationRepository {
  create(title?: string, options?: { workspaceId?: string; projectId?: string }): Promise<ConversationRow>;
  list(): Promise<ConversationRow[]>;
  getById(id: string): Promise<ConversationRow | null>;
  update(id: string, data: { title?: string; modelUsed?: string }): Promise<ConversationRow>;
  delete(id: string): Promise<boolean>;
  addMessage(conversationId: string, data: MessageInput): Promise<MessageRow>;
  getMessages(conversationId: string): Promise<MessageRow[]>;
  clear(): Promise<number>;
  updateTokenUsage(id: string, promptTokens: number, completionTokens: number): Promise<ConversationRow>;
  editMessage(conversationId: string, messageId: string, newContent: string): Promise<MessageRow>;
  getMessageBranches(messageId: string): Promise<MessageRow[]>;
  getConversationTree(conversationId: string): Promise<MessageTreeNode[]>;
  deleteMessage(messageId: string): Promise<boolean>;
  markMessagesCompressed(messageIds: string[]): Promise<number>;
  searchMessages(query: string, limit?: number): Promise<SearchResult[]>;
}

// ---- Input Types: New Tables ----

export interface CreateToolCallLogInput {
  toolId: string;
  toolName: string;
  appId?: string;
  source: "mcp" | "native" | "skill" | "rest";
  args?: unknown;
  resultSuccess?: boolean;
  resultData?: unknown;
  resultError?: string;
  risk?: string;
  confirmedByUser?: boolean;
  durationMs?: number;
  conversationId?: string;
}

export interface UpsertAppConnectionInput {
  appId: string;
  appName: string;
  source: "mcp" | "native" | "skill" | "rest";
  config?: unknown;
  status?: "disconnected" | "connecting" | "connected" | "error";
  lastError?: string;
  toolCount?: number;
}

export interface UpsertModelProfileInput {
  provider: string;
  modelName: string;
  displayName?: string;
  capabilities?: unknown;
  limits?: unknown;
  cost?: unknown;
  isDefault?: boolean;
}

export interface UpsertMemoryInput {
  userId?: string;
  scopeType?: MemoryRow["scopeType"];
  scopeId?: string | null;
  type: "fact" | "preference" | "context" | "summary";
  tier?: "preference" | "context" | "fact";
  key: string;
  value: string;
  source?: string;
  confidence?: number;
  sourceRunId?: string;
  sourceMessageId?: string;
  expiresAt?: string;
}

// ---- Repository Interfaces: New Tables ----

export interface ToolCallLogRepository {
  create(input: CreateToolCallLogInput): Promise<ToolCallLogRow>;
  getByConversation(conversationId: string): Promise<ToolCallLogRow[]>;
  getByTool(toolId: string): Promise<ToolCallLogRow[]>;
  getRecent(limit?: number): Promise<ToolCallLogRow[]>;
}

export interface AppConnectionRepository {
  getAll(): Promise<AppConnectionRow[]>;
  getByAppId(appId: string): Promise<AppConnectionRow | null>;
  upsert(input: UpsertAppConnectionInput): Promise<AppConnectionRow>;
  delete(appId: string): Promise<boolean>;
}

export interface ModelProfileRepository {
  getAll(): Promise<ModelProfileRow[]>;
  getDefault(): Promise<ModelProfileRow | null>;
  upsert(input: UpsertModelProfileInput): Promise<ModelProfileRow>;
  setDefault(id: string): Promise<void>;
  delete(id: string): Promise<boolean>;
}

export interface ScoredMemoryRow extends MemoryRow {
  score: number;
}

export interface MemoryRepository {
  getAll(userId?: string): Promise<MemoryRow[]>;
  getByType(type: MemoryRow["type"], userId?: string): Promise<MemoryRow[]>;
  getByTier(tier: MemoryRow["tier"], userId?: string): Promise<MemoryRow[]>;
  getByKey(key: string, userId?: string): Promise<MemoryRow | null>;
  fetchByScope(scopeType: MemoryRow["scopeType"], scopeId: string, userId?: string): Promise<MemoryRow[]>;
  fetchRelevantMemories(query: string, scope?: { type: MemoryRow["scopeType"]; id: string } | null, userId?: string, limit?: number): Promise<ScoredMemoryRow[]>;
  search(query: string, userId?: string): Promise<MemoryRow[]>;
  searchScored(query: string, userId?: string, limit?: number): Promise<ScoredMemoryRow[]>;
  upsert(input: UpsertMemoryInput): Promise<MemoryRow>;
  upsertPreferences(prefs: { key: string; value: string }[], userId?: string, scopeType?: MemoryRow["scopeType"], scopeId?: string | null): Promise<MemoryRow[]>;
  incrementUses(id: string): Promise<void>;
  recordInjection(id: string): Promise<void>;
  promoteHighUsage(minUses?: number): Promise<number>;
  delete(id: string): Promise<boolean>;
  cleanExpired(): Promise<number>;
  pruneUnusedMemories(maxAgeDays?: number): Promise<number>;
  clear(): Promise<number>;
}

// ---- Scheduled Tasks ----

export interface ScheduledTaskRow {
  id: string;
  name: string;
  cronExpr: string;
  prompt: string | null;
  skillName: string | null;
  input: unknown | null;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  lastResult: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduledTaskInput {
  name: string;
  cronExpr: string;
  prompt?: string;
  skillName?: string;
  input?: Record<string, unknown>;
  enabled?: boolean;
}

export interface UpdateScheduledTaskData {
  name?: string;
  cronExpr?: string;
  prompt?: string;
  skillName?: string;
  input?: Record<string, unknown>;
  enabled?: boolean;
}

export interface ScheduledTaskRepository {
  getAll(): Promise<ScheduledTaskRow[]>;
  getById(id: string): Promise<ScheduledTaskRow | null>;
  upsert(input: CreateScheduledTaskInput): Promise<ScheduledTaskRow>;
  update(id: string, data: UpdateScheduledTaskData): Promise<ScheduledTaskRow>;
  delete(id: string): Promise<boolean>;
  setEnabled(id: string, enabled: boolean): Promise<void>;
  updateLastRun(id: string, lastRun: string, nextRun: string, result?: unknown): Promise<void>;
}

// ---- Agent Run ----

export interface CreateAgentRunInput {
  conversationId?: string;
  workspaceId?: string;
  projectId?: string;
  taskId?: string;
  agentId?: string;
  userMessageId?: string;
  assistantMessageId?: string;
  mode?: AgentRunRow["mode"];
  selectedModel?: string;
  routeReason?: string;
  selectedTools?: string[];
}

export interface AgentRunRepository {
  create(input: CreateAgentRunInput): Promise<AgentRunRow>;
  getById(id: string): Promise<AgentRunRow | null>;
  getByConversation(conversationId: string): Promise<AgentRunRow[]>;
  getRecent(limit?: number): Promise<AgentRunRow[]>;
  getQueued(limit?: number): Promise<AgentRunRow[]>;
  updateStatus(id: string, status: AgentRunRow["status"], error?: string): Promise<void>;
  updateArtifacts(id: string, artifacts: unknown[]): Promise<void>;
}

// ---- Goals ----

export interface GoalRow {
  id: string;
  userId: string;
  description: string;
  status: "active" | "paused" | "completed" | "abandoned";
  progress: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGoalInput {
  description: string;
  status?: GoalRow["status"];
  progress?: unknown;
}

export interface UpdateGoalData {
  description?: string;
  status?: GoalRow["status"];
  progress?: unknown;
}

export interface GoalRepository {
  create(input: CreateGoalInput): Promise<GoalRow>;
  getById(id: string): Promise<GoalRow | null>;
  list(userId?: string): Promise<GoalRow[]>;
  getActive(userId?: string): Promise<GoalRow[]>;
  update(id: string, data: UpdateGoalData): Promise<GoalRow>;
  delete(id: string): Promise<boolean>;
}

// ---- Workspaces ----

export interface WorkspaceRow {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  settings: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkspaceInput {
  name?: string;
  description?: string;
  ownerId: string;
  settings?: unknown;
}

export interface UpdateWorkspaceData {
  name?: string;
  description?: string;
  settings?: unknown;
}

export interface WorkspaceRepository {
  create(input: CreateWorkspaceInput): Promise<WorkspaceRow>;
  getById(id: string): Promise<WorkspaceRow | null>;
  getByOwnerId(ownerId: string): Promise<WorkspaceRow[]>;
  getDefault(ownerId: string): Promise<WorkspaceRow | null>;
  update(id: string, data: UpdateWorkspaceData): Promise<WorkspaceRow>;
  delete(id: string): Promise<boolean>;
}

// ---- Projects ----

export interface ProjectRow {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: "active" | "archived" | "completed";
  settings: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  workspaceId: string;
  name: string;
  description?: string;
  status?: ProjectRow["status"];
  settings?: unknown;
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
  status?: ProjectRow["status"];
  settings?: unknown;
}

export interface ProjectRepository {
  create(input: CreateProjectInput): Promise<ProjectRow>;
  getById(id: string): Promise<ProjectRow | null>;
  getByWorkspaceId(workspaceId: string): Promise<ProjectRow[]>;
  getActiveByWorkspaceId(workspaceId: string): Promise<ProjectRow[]>;
  update(id: string, data: UpdateProjectData): Promise<ProjectRow>;
  delete(id: string): Promise<boolean>;
}

// ---- Agent Profiles ----

export interface AgentProfileRow {
  id: string;
  name: string;
  description: string | null;
  role: "general" | "planner" | "coding" | "review" | "testing" | "research";
  capabilities: string[];
  enabled: boolean;
  modelPolicy: import("../shared/agent-profile-types.js").AgentModelPolicy;
  executorPolicy: import("../shared/agent-profile-types.js").AgentExecutorPolicy | null;
  skills: string[];
  tools: string[];
  knowledgeScopes: string[];
  permissions: string[];
  memoryScopes: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentProfileInput {
  name: string;
  description?: string;
  role?: "general" | "planner" | "coding" | "review" | "testing" | "research";
  capabilities?: string[];
  enabled?: boolean;
  modelPolicy?: import("../shared/agent-profile-types.js").AgentModelPolicy;
  executorPolicy?: import("../shared/agent-profile-types.js").AgentExecutorPolicy | null;
  skills?: string[];
  tools?: string[];
  knowledgeScopes?: string[];
  permissions?: string[];
  memoryScopes?: string[];
  isDefault?: boolean;
}

export interface UpdateAgentProfileData {
  name?: string;
  description?: string;
  role?: "general" | "planner" | "coding" | "review" | "testing" | "research";
  capabilities?: string[];
  enabled?: boolean;
  modelPolicy?: import("../shared/agent-profile-types.js").AgentModelPolicy;
  executorPolicy?: import("../shared/agent-profile-types.js").AgentExecutorPolicy | null;
  skills?: string[];
  tools?: string[];
  knowledgeScopes?: string[];
  permissions?: string[];
  memoryScopes?: string[];
  isDefault?: boolean;
}

export interface AgentProfileRepository {
  create(input: CreateAgentProfileInput): Promise<AgentProfileRow>;
  getById(id: string): Promise<AgentProfileRow | null>;
  getAll(): Promise<AgentProfileRow[]>;
  getDefault(): Promise<AgentProfileRow | null>;
  update(id: string, data: UpdateAgentProfileData): Promise<AgentProfileRow>;
  delete(id: string): Promise<boolean>;
}

// ---- Agent Run Events ----

export interface AgentRunEventRow {
  id: string;
  runId: string;
  sequence: number;
  type: string;
  payload: unknown;
  createdAt: string;
}

export interface CreateAgentRunEventInput {
  runId: string;
  sequence: number;
  type: string;
  payload?: unknown;
}

export interface AgentRunEventRepository {
  create(input: CreateAgentRunEventInput): Promise<AgentRunEventRow>;
  getByRunId(runId: string): Promise<AgentRunEventRow[]>;
  getByType(runId: string, type: string): Promise<AgentRunEventRow[]>;
}

// ---- Approval Requests ----

export interface ApprovalRequestRow {
  id: string;
  runId: string;
  toolId: string;
  toolName: string;
  args: unknown;
  risk: string;
  status: "pending" | "approved" | "denied" | "expired";
  projectScope: boolean;
  decidedAt: number | null;
  createdAt: number;
  mode: string | null;
  source: string | null;
  preview: string | null;
  toolCallId: string | null;
  expiresAt: number | null;
  operationKind: string | null;
  operationPayload: unknown;
}

export interface CreateApprovalRequestInput {
  id?: string;
  runId: string;
  toolId: string;
  toolName: string;
  args: unknown;
  risk: string;
  projectScope?: boolean;
  mode?: string;
  source?: string;
  preview?: string;
  toolCallId?: string;
  expiresAt?: number;
  operationKind?: string;
  operationPayload?: unknown;
}

export interface ApprovalRequestRepository {
  create(input: CreateApprovalRequestInput): Promise<ApprovalRequestRow>;
  getById(id: string): Promise<ApprovalRequestRow | null>;
  getPending(): Promise<ApprovalRequestRow[]>;
  getByRunId(runId: string): Promise<ApprovalRequestRow[]>;
  findByToolCallId(toolCallId: string): Promise<ApprovalRequestRow | null>;
  approve(id: string): Promise<ApprovalRequestRow>;
  deny(id: string): Promise<ApprovalRequestRow>;
  expireStale(maxAgeMs?: number): Promise<{ count: number; ids: string[] }>;
}

// ---- Permission Memories ----

export interface PermissionMemoryRow {
  id: string;
  userId: string;
  projectId: string | null;
  toolId: string;
  risk: string;
  decision: "auto" | "confirm" | "deny";
  scope: "global" | "project" | "session";
  createdAt: number;
  expiresAt: number | null;
}

export interface CreatePermissionMemoryInput {
  userId?: string;
  projectId?: string | null;
  toolId: string;
  risk: string;
  decision: "auto" | "confirm" | "deny";
  scope?: "global" | "project" | "session";
  expiresAt?: number | null;
}

export interface PermissionMemoryRepository {
  create(input: CreatePermissionMemoryInput): Promise<PermissionMemoryRow>;
  find(toolId: string, userId?: string, projectId?: string): Promise<PermissionMemoryRow | null>;
  getByUserId(userId: string): Promise<PermissionMemoryRow[]>;
  getByProjectId(projectId: string): Promise<PermissionMemoryRow[]>;
  delete(id: string): Promise<boolean>;
}

// ---- Event Log ----

export interface EventLogRow {
  id: string;
  type: string;
  projectId: string | null;
  taskId: string | null;
  agentRunId: string | null;
  runtimeId: string | null;
  payload: unknown | null;
  createdAt: string;
}

export interface CreateEventLogInput {
  type: string;
  projectId?: string | null;
  taskId?: string | null;
  agentRunId?: string | null;
  runtimeId?: string | null;
  payload?: unknown;
}

export interface EventLogFilters {
  type?: string;
  projectId?: string;
  agentRunId?: string;
  runtimeId?: string;
  since?: string;
  limit?: number;
  offset?: number;
}

export interface EventLogRepository {
  create(input: CreateEventLogInput): Promise<EventLogRow>;
  query(filters?: EventLogFilters): Promise<EventLogRow[]>;
  count(filters?: EventLogFilters): Promise<number>;
}

// ---- Audit Log ----

export interface AuditLogRow {
  id: string;
  actor: string;
  action: string;
  resource: string;
  riskLevel: string | null;
  permissionDecision: string | null;
  confirmedByUser: boolean | null;
  result: string | null;
  metadata: unknown | null;
  createdAt: string;
}

export interface CreateAuditLogInput {
  actor: string;
  action: string;
  resource: string;
  riskLevel?: string;
  permissionDecision?: string;
  confirmedByUser?: boolean;
  result?: string;
  metadata?: unknown;
}

export interface AuditLogFilters {
  actor?: string;
  action?: string;
  riskLevel?: string;
  since?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogRepository {
  create(input: CreateAuditLogInput): Promise<AuditLogRow>;
  query(filters?: AuditLogFilters): Promise<AuditLogRow[]>;
  count(filters?: AuditLogFilters): Promise<number>;
}

// ---- Aggregate ----

export interface Repositories {
  tasks: TaskRepository;
  articles: ArticleRepository;
  reviews: ReviewRepository;
  conversations: ConversationRepository;
  toolCallLogs: ToolCallLogRepository;
  appConnections: AppConnectionRepository;
  modelProfiles: ModelProfileRepository;
  memories: MemoryRepository;
  agentRuns: AgentRunRepository;
  scheduledTasks: ScheduledTaskRepository;
  goals: GoalRepository;
  workspaces: WorkspaceRepository;
  projects: ProjectRepository;
  agentProfiles: AgentProfileRepository;
  approvalRequests: ApprovalRequestRepository;
  permissionMemories: PermissionMemoryRepository;
  agentRunEvents: AgentRunEventRepository;
  eventLog: EventLogRepository;
  auditLog: AuditLogRepository;
}
