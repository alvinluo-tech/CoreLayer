import { invoke } from '@tauri-apps/api/core';
import type { Task } from '@/types/task';
import type { Article } from '@/types/article';
import type { Workspace, Project } from '@/stores/workspaceStore';

// ---- Types ----

export interface ChatResponse {
  reply: string;
  toolCalls: { name: string; args: unknown; result: unknown }[];
}

export interface Conversation {
  id: string;
  title: string;
  modelUsed: string;
  messageCount: number;
  promptTokens: number;
  completionTokens: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls: string | null;
  toolCallId: string | null;
  createdAt: string;
}

export interface ConversationWithMessages {
  conversation: Conversation;
  messages: ConversationMessage[];
}

export interface SendMessageResponse {
  userMessage: ConversationMessage;
  assistantMessage: ConversationMessage;
  conversation: Conversation;
}

// ---- Legacy Chat ----

export async function sendChatMessage(message: string): Promise<ChatResponse> {
  return invoke<ChatResponse>('send_message', { message });
}

export async function getHealthStatus(): Promise<{ status: string; timestamp: string }> {
  return invoke('health_check');
}

// ---- Conversation Management ----

export async function listConversations(): Promise<Conversation[]> {
  const resp = await invoke<{ conversations: Conversation[] }>('list_conversations');
  return resp.conversations;
}

export async function createConversation(title?: string): Promise<Conversation> {
  return invoke<Conversation>('create_conversation', { title: title ?? null });
}

export async function getConversation(id: string): Promise<ConversationWithMessages> {
  return invoke<ConversationWithMessages>('get_conversation', { id });
}

export async function deleteConversation(id: string): Promise<void> {
  await invoke('delete_conversation', { id });
}

export async function updateConversation(id: string, title: string): Promise<Conversation> {
  return invoke<Conversation>('update_conversation', { id, title });
}

export async function sendConversationMessage(
  conversationId: string,
  content: string
): Promise<SendMessageResponse> {
  return invoke<SendMessageResponse>('send_conversation_message', {
    conversationId,
    content,
  });
}

// ---- Task Management ----

export async function queryTasks(options?: {
  status?: string;
  priority?: number;
}): Promise<{ tasks: Task[]; count: number }> {
  return invoke('query_tasks', {
    status: options?.status ?? null,
    priority: options?.priority ?? null,
  });
}

export async function createTask(input: {
  title: string;
  priority?: number;
  dueDate?: string;
  tags?: string[];
  description?: string;
}): Promise<{ task: Task }> {
  return invoke('create_task', {
    title: input.title,
    priority: input.priority ?? null,
    dueDate: input.dueDate ?? null,
    tags: input.tags ?? null,
    description: input.description ?? null,
  });
}

export async function updateTask(input: {
  taskId: string;
  title?: string;
  priority?: number;
  status?: string;
  dueDate?: string;
  tags?: string[];
}): Promise<{ task: Task }> {
  return invoke('update_task', {
    taskId: input.taskId,
    title: input.title ?? null,
    priority: input.priority ?? null,
    status: input.status ?? null,
    dueDate: input.dueDate ?? null,
    tags: input.tags ?? null,
  });
}

export async function deleteTask(taskId: string): Promise<void> {
  await invoke('delete_task', { taskId });
}

// ---- Task Graph Management ----

export async function setTaskDependencies(
  taskId: string,
  dependencies: string[]
): Promise<{ task: Task }> {
  return invoke('set_task_dependencies', { taskId, dependencies });
}

export async function canExecuteTask(taskId: string): Promise<{ canExecute: boolean }> {
  return invoke('can_execute_task', { taskId });
}

export async function completeTask(taskId: string): Promise<{ task: Task }> {
  return invoke('complete_task', { taskId });
}

export async function getExecutableTasks(
  projectId: string
): Promise<{ tasks: Task[]; count: number }> {
  return invoke('get_executable_tasks', { projectId });
}

export async function detectTaskCycles(
  projectId: string
): Promise<{ cycles: string[][]; hasCycles: boolean }> {
  return invoke('detect_task_cycles', { projectId });
}

export async function decomposeTask(input: {
  objective: string;
  projectId: string;
  agentId?: string;
}): Promise<{ parentTaskId: string; subtasks: { id: string; title: string }[] }> {
  return invoke('decompose_task_command', {
    objective: input.objective,
    projectId: input.projectId,
    agentId: input.agentId ?? null,
  });
}

// ---- Article Management ----

export async function getReadingList(options?: {
  status?: string;
  category?: string;
}): Promise<{ articles: Article[]; count: number }> {
  return invoke('get_reading_list', {
    status: options?.status ?? null,
    category: options?.category ?? null,
  });
}

export async function addArticle(input: {
  title: string;
  url?: string;
  category?: string;
  description?: string;
}): Promise<{ article: Article }> {
  return invoke('add_article', {
    title: input.title,
    url: input.url ?? null,
    category: input.category ?? null,
    description: input.description ?? null,
  });
}

export async function updateReadingStatus(input: {
  articleId: string;
  status: string;
  rating?: number;
  notes?: string;
}): Promise<{ article: Article }> {
  return invoke('update_reading_status', {
    articleId: input.articleId,
    status: input.status,
    rating: input.rating ?? null,
    notes: input.notes ?? null,
  });
}

// ---- Review Management ----

export async function getDailySummary(date?: string): Promise<{
  tasksCompleted: number;
  tasksTotal: number;
  completionRate: number;
  articlesRead: number;
  highlights: string[];
}> {
  return invoke('get_daily_summary', { date: date ?? null });
}

export async function getWeeklyStats(weekStart?: string): Promise<{
  tasksCompleted: number;
  tasksTotal: number;
  completionRate: number;
  dailyBreakdown: { date: string; completed: number; total: number }[];
  articlesFinished: number;
  topTags: { tag: string; count: number }[];
}> {
  return invoke('get_weekly_stats', { weekStart: weekStart ?? null });
}

// ---- Settings Management ----

export async function getSettings(): Promise<{
  storageMode: string;
  availableModes: string[];
  cloudConfigured: boolean;
}> {
  return invoke('get_settings');
}

export async function updateStorageMode(mode: string): Promise<{
  storageMode: string;
  message: string;
}> {
  return invoke('update_storage_mode', { mode });
}

export interface DbStats {
  success: boolean;
  dbSize: string;
  entryCount: {
    conversations: number;
    tasks: number;
    articles: number;
  };
}

export async function getDbStats(): Promise<DbStats> {
  return invoke('get_db_stats');
}

export interface ModelUsageSummary {
  modelId: string;
  displayName: string;
  conversationCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface UsageStats {
  totalConversations: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  models: ModelUsageSummary[];
}

export async function getUsageStats(): Promise<UsageStats> {
  return invoke('get_usage_stats');
}

export interface DbTableInfo {
  id: string;
  name: string;
  description: string;
  count: number;
}

export async function dbManagerListTables(): Promise<{ success: boolean; tables: DbTableInfo[] }> {
  return invoke('db_manager_list_tables');
}

export async function dbManagerGetTableRows(
  tableName: string
): Promise<{ success: boolean; rows: Record<string, unknown>[] }> {
  return invoke('db_manager_get_table_rows', { tableName });
}

export async function dbManagerDeleteRow(
  tableName: string,
  id: string
): Promise<{ success: boolean; deleted: boolean }> {
  return invoke('db_manager_delete_row', { tableName, id });
}

export async function dbManagerClearTable(
  tableName: string
): Promise<{ success: boolean; message: string }> {
  return invoke('db_manager_clear_table', { tableName });
}

export interface DbConfig {
  supabaseUrl?: string;
  supabaseServiceKey?: string;
  postgresUrl?: string;
}

export async function dbConfigGet(): Promise<DbConfig> {
  return invoke('db_config_get');
}

export async function dbConfigSet(
  config: DbConfig
): Promise<{ success: boolean; message: string }> {
  return invoke('db_config_set', { config });
}

export async function dbConfigTest(testParams: {
  type: 'supabase' | 'postgres';
  supabaseUrl?: string;
  supabaseServiceKey?: string;
  postgresUrl?: string;
}): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
  return invoke('db_config_test', { testParams });
}

export async function dbConfigMigrate(): Promise<{ success: boolean; message: string }> {
  return invoke('db_config_migrate');
}

// ---- Voice ----

export interface VoiceStatus {
  asr: boolean;
  tts: { available: boolean; provider: string };
  vad: { available: boolean; note: string };
}

export async function getVoiceStatus(): Promise<VoiceStatus> {
  return invoke('get_voice_status');
}

export async function getDaemonUrl(): Promise<string> {
  return invoke('get_daemon_url_command');
}

export async function getHealth(): Promise<{
  status: string;
  timestamp: string;
  storageMode: string;
  aiProvider: string;
  aiModel: string;
}> {
  return invoke('health_check');
}

// ---- MCP Server Management ----

export interface MCPServerInfo {
  config: {
    id: string;
    name: string;
    transport: string;
    url?: string;
    enabled: boolean;
  };
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  tools: { name: string; description?: string }[];
  resources: { uri: string; name: string; description?: string }[];
  prompts: { name: string; description?: string }[];
  lastConnected?: string;
  lastError?: string;
}

export async function listMCPServers(): Promise<{ servers: MCPServerInfo[] }> {
  return invoke('list_mcp_servers');
}

export async function connectMCPServer(config: {
  id: string;
  name: string;
  transport: 'http' | 'stdio' | 'sse';
  url?: string;
  command?: string;
  enabled: boolean;
}): Promise<{ success: boolean; server?: MCPServerInfo; error?: string }> {
  return invoke('connect_mcp_server', { config });
}

export async function disconnectMCPServer(
  serverId: string
): Promise<{ success: boolean; error?: string }> {
  return invoke('disconnect_mcp_server', { serverId });
}

export async function updateMCPServer(
  serverId: string,
  config: {
    name: string;
    transport: 'http' | 'stdio' | 'sse';
    url?: string;
    command?: string;
    enabled: boolean;
  }
): Promise<{ success: boolean; server?: MCPServerInfo; error?: string }> {
  return invoke('update_mcp_server', { serverId, config });
}

export async function listMCPTools(): Promise<{
  tools: { name: string; description?: string }[];
  count: number;
}> {
  return invoke('list_mcp_tools');
}

export async function listMCPResources(): Promise<{
  resources: { uri: string; name: string }[];
  count: number;
}> {
  return invoke('list_mcp_resources');
}

export async function listMCPPrompts(): Promise<{
  prompts: { name: string; description?: string }[];
  count: number;
}> {
  return invoke('list_mcp_prompts');
}

// ---- Unified Tool Registry ----

export interface ToolInfo {
  id: string;
  appId: string;
  source: 'mcp' | 'native' | 'skill' | 'rest';
  name: string;
  title: string;
  description: string;
  risk: 'low' | 'medium' | 'high' | 'critical';
  permissions: string[];
  requiresConfirmation: boolean;
  inputSchema: Record<string, unknown>;
}

export async function listAllTools(): Promise<{
  tools: ToolInfo[];
  count: number;
  bySource: { native: number; mcp: number; skill: number; rest: number };
}> {
  return invoke('list_all_tools');
}

export async function getTool(toolId: string): Promise<ToolInfo> {
  return invoke('get_tool', { toolId });
}

export async function getToolCallLogs(limit = 20): Promise<{ logs: ToolCallLogEntry[] }> {
  return invoke('get_tool_call_logs', { limit });
}

// ---- Model Gateway ----

export interface ModelProfile {
  id: string;
  provider: string;
  modelName: string;
  displayName: string;
  capabilities: {
    text: boolean;
    streaming: boolean;
    toolCalling: boolean;
    vision: boolean;
    audioInput: boolean;
    tts: boolean;
    jsonMode: boolean;
    longContext: boolean;
  };
  limits: { contextWindow: number; maxOutputTokens: number };
  cost: { input: number; output: number };
}

export async function listModelProfiles(): Promise<{ profiles: ModelProfile[] }> {
  return invoke('list_model_profiles');
}

// ---- Provider Config ----

export interface ProviderCredentialView {
  apiKey: string; // masked
  baseURL: string;
}

export async function getProviderConfigs(): Promise<{
  providers: Record<string, ProviderCredentialView>;
}> {
  return invoke('get_provider_configs');
}

export async function updateProviderConfig(
  name: string,
  config: { apiKey?: string; baseURL?: string }
): Promise<{ success: boolean }> {
  return invoke('update_provider_config', { name, apiKey: config.apiKey, baseUrl: config.baseURL });
}

// ---- Provider Presets & CRUD ----

export interface ProviderPreset {
  id: string;
  name: string;
  nameCN: string;
  type: 'openai_compatible' | 'ollama';
  defaultBaseURL: string;
  requiresApiKey: boolean;
  popularModels: { id: string; name: string }[];
}

export interface StoredProvider {
  id: string;
  name: string;
  type: 'openai_compatible' | 'ollama';
  baseURL: string;
  apiKey?: string;
  enabled: boolean;
}

export async function listProviderPresets(): Promise<{ presets: ProviderPreset[] }> {
  return invoke('list_provider_presets');
}

export async function getProviders(): Promise<{
  providers: StoredProvider[] | Record<string, StoredProvider & { enabled: boolean }>;
  isLegacy: boolean;
}> {
  return invoke('get_provider_configs');
}

export async function addProvider(config: {
  id: string;
  name: string;
  type?: string;
  baseURL: string;
  apiKey?: string;
  enabled?: boolean;
}): Promise<{ success: boolean }> {
  return invoke('add_provider', { config });
}

export async function removeProvider(id: string): Promise<{ success: boolean }> {
  return invoke('remove_provider', { id });
}

export async function discoverModels(
  providerId: string
): Promise<{ models: { id: string; name: string }[] }> {
  return invoke('discover_models', { providerId });
}

export async function testProviderConnection(
  providerId: string
): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
  return invoke('test_provider_connection', { providerId });
}

// ---- Routing Rules ----

export interface RoutingRule {
  taskType: string;
  modelId: string;
  conditions?: Record<string, unknown>;
}

export async function getRoutingRules(): Promise<{ rules: RoutingRule[]; isCustom: boolean }> {
  return invoke('get_routing_rules');
}

export async function updateRoutingRules(rules: RoutingRule[]): Promise<{ success: boolean }> {
  return invoke('update_routing_rules', { rules });
}

// ---- Active Model ----

export async function getActiveModel(): Promise<{ modelId: string; profile: ModelProfile | null }> {
  return invoke('get_active_model');
}

export async function setActiveModel(modelId: string): Promise<{ success: boolean }> {
  return invoke('set_active_model', { modelId });
}

// ---- TICK Config ----

export interface TickConfig {
  enabled: boolean;
  intervalMinutes: number;
  modelId?: string;
  providerId?: string;
}

export async function getTickConfig(): Promise<TickConfig> {
  return invoke('get_tick_config');
}

export async function updateTickConfig(
  config: Partial<TickConfig>
): Promise<{ success: boolean; config: TickConfig }> {
  return invoke('update_tick_config', { config });
}

// ---- Model Profile CRUD ----

export async function upsertModelProfile(profile: {
  provider: string;
  modelName: string;
  displayName?: string;
  capabilities?: Record<string, boolean>;
  limits?: { contextWindow: number; maxOutputTokens: number };
  cost?: { input: number; output: number };
}): Promise<{ success: boolean; profile: ModelProfile }> {
  return invoke('upsert_model_profile', { profile });
}

export async function deleteModelProfile(id: string): Promise<{ success: boolean }> {
  return invoke('delete_model_profile', { id });
}

// ---- Daemon Supervisor ----

export interface DaemonStatus {
  running: boolean;
  healthy: boolean;
  url: string;
  restartAttempts: number;
  lastHealthCheck: string | null;
  lastError: string | null;
  pid: number | null;
  port: number | null;
  logPath: string | null;
  runtimeMode: string;
}

export async function getDaemonStatus(): Promise<DaemonStatus> {
  return invoke('daemon_status');
}

export async function restartDaemon(): Promise<DaemonStatus> {
  return invoke('restart_daemon');
}

// ---- Tool Call Audit Logs ----

export interface ToolCallLogEntry {
  id: string;
  toolId: string;
  toolName: string;
  appId: string | null;
  source: string;
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

// ---- Workspace Management ----

export async function listWorkspaces(): Promise<{ data: Workspace[] }> {
  return invoke('list_workspaces');
}

export async function createWorkspace(
  name: string,
  description?: string
): Promise<{ data: Workspace }> {
  return invoke('create_workspace', { name, description: description ?? null });
}

export async function updateWorkspace(
  id: string,
  data: { name?: string; description?: string }
): Promise<{ data: Workspace }> {
  return invoke('update_workspace', {
    id,
    name: data.name ?? null,
    description: data.description ?? null,
  });
}

export async function deleteWorkspace(id: string): Promise<{ success: boolean }> {
  return invoke('delete_workspace', { id });
}

// ---- Project Management ----

export async function listProjects(workspaceId: string): Promise<{ data: Project[] }> {
  return invoke('list_projects', { workspaceId });
}

export async function createProject(
  workspaceId: string,
  name: string,
  description?: string
): Promise<{ data: Project }> {
  return invoke('create_project', {
    workspaceId,
    name,
    description: description ?? null,
  });
}

export async function updateProject(
  id: string,
  data: { name?: string; description?: string; status?: string }
): Promise<{ data: Project }> {
  return invoke('update_project', {
    id,
    name: data.name ?? null,
    description: data.description ?? null,
    status: data.status ?? null,
  });
}

export async function deleteProject(id: string): Promise<{ success: boolean }> {
  return invoke('delete_project', { id });
}
