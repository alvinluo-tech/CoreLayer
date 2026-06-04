// Repository interfaces for storage abstraction
// Both SQLite and Supabase implementations conform to these interfaces

// ---- Row Types (normalized, no storage-specific types leak through) ----

export interface TaskRow {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  priority: number;
  status: "pending" | "in_progress" | "done" | "deleted";
  dueDate: string | null;
  tags: string[] | null;
  completedAt: string | null;
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
  tokenCount: number | null;
  createdAt: string;
}

// ---- Input Types ----

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: number;
  dueDate?: string;
  tags?: string[];
}

export interface TaskFilters {
  status?: string;
  priority?: number;
  dueDateFrom?: string;
  dueDateTo?: string;
}

export interface UpdateTaskData {
  title?: string;
  priority?: number;
  status?: string;
  dueDate?: string;
  tags?: string[];
  completedAt?: string;
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
  tokenCount?: number;
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
  type: "fact" | "preference" | "context" | "summary";
  tier: "preference" | "context" | "fact";
  key: string;
  value: string;
  source: string | null;
  confidence: number | null;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRunRow {
  id: string;
  conversationId: string | null;
  userMessageId: string | null;
  assistantMessageId: string | null;
  status: "running" | "succeeded" | "failed" | "cancelled";
  selectedModel: string | null;
  routeReason: string | null;
  toolCallCount: number | null;
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
  create(title?: string): Promise<ConversationRow>;
  list(): Promise<ConversationRow[]>;
  getById(id: string): Promise<ConversationRow | null>;
  update(id: string, data: { title?: string }): Promise<ConversationRow>;
  delete(id: string): Promise<boolean>;
  addMessage(conversationId: string, data: MessageInput): Promise<MessageRow>;
  getMessages(conversationId: string): Promise<MessageRow[]>;
  clear(): Promise<number>;
  updateTokenUsage(id: string, promptTokens: number, completionTokens: number): Promise<ConversationRow>;
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
  type: "fact" | "preference" | "context" | "summary";
  tier?: "preference" | "context" | "fact";
  key: string;
  value: string;
  source?: string;
  confidence?: number;
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
  search(query: string, userId?: string): Promise<MemoryRow[]>;
  searchScored(query: string, userId?: string, limit?: number): Promise<ScoredMemoryRow[]>;
  upsert(input: UpsertMemoryInput): Promise<MemoryRow>;
  upsertPreferences(prefs: { key: string; value: string }[], userId?: string): Promise<MemoryRow[]>;
  incrementUses(id: string): Promise<void>;
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
  userMessageId?: string;
  assistantMessageId?: string;
  selectedModel?: string;
  routeReason?: string;
}

export interface AgentRunRepository {
  create(input: CreateAgentRunInput): Promise<AgentRunRow>;
  getById(id: string): Promise<AgentRunRow | null>;
  getByConversation(conversationId: string): Promise<AgentRunRow[]>;
  getRecent(limit?: number): Promise<AgentRunRow[]>;
  updateStatus(id: string, status: AgentRunRow["status"], error?: string): Promise<void>;
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
}
