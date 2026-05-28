import { invoke } from "@tauri-apps/api/core";

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
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system" | "tool";
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
  return invoke<ChatResponse>("send_message", { message });
}

export async function getHealthStatus(): Promise<{ status: string; timestamp: string }> {
  return invoke("health_check");
}

// ---- Conversation Management ----

export async function listConversations(): Promise<Conversation[]> {
  const resp = await invoke<{ conversations: Conversation[] }>("list_conversations");
  return resp.conversations;
}

export async function createConversation(title?: string): Promise<Conversation> {
  return invoke<Conversation>("create_conversation", { title: title ?? null });
}

export async function getConversation(id: string): Promise<ConversationWithMessages> {
  return invoke<ConversationWithMessages>("get_conversation", { id });
}

export async function deleteConversation(id: string): Promise<void> {
  await invoke("delete_conversation", { id });
}

export async function updateConversation(id: string, title: string): Promise<Conversation> {
  return invoke<Conversation>("update_conversation", { id, title });
}

export async function sendConversationMessage(
  conversationId: string,
  content: string,
): Promise<SendMessageResponse> {
  return invoke<SendMessageResponse>("send_conversation_message", {
    conversationId,
    content,
  });
}

// ---- Task Management ----

export async function queryTasks(options?: { status?: string; priority?: number }): Promise<{ tasks: unknown[]; count: number }> {
  return invoke("query_tasks", {
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
}): Promise<{ task: unknown }> {
  return invoke("create_task", {
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
}): Promise<{ task: unknown }> {
  return invoke("update_task", {
    taskId: input.taskId,
    title: input.title ?? null,
    priority: input.priority ?? null,
    status: input.status ?? null,
    dueDate: input.dueDate ?? null,
    tags: input.tags ?? null,
  });
}

export async function deleteTask(taskId: string): Promise<void> {
  await invoke("delete_task", { taskId });
}

// ---- Article Management ----

export async function getReadingList(options?: { status?: string; category?: string }): Promise<{ articles: unknown[]; count: number }> {
  return invoke("get_reading_list", {
    status: options?.status ?? null,
    category: options?.category ?? null,
  });
}

export async function addArticle(input: {
  title: string;
  url?: string;
  category?: string;
  description?: string;
}): Promise<{ article: unknown }> {
  return invoke("add_article", {
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
}): Promise<{ article: unknown }> {
  return invoke("update_reading_status", {
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
  return invoke("get_daily_summary", { date: date ?? null });
}

export async function getWeeklyStats(weekStart?: string): Promise<{
  tasksCompleted: number;
  tasksTotal: number;
  completionRate: number;
  dailyBreakdown: { date: string; completed: number; total: number }[];
  articlesFinished: number;
  topTags: { tag: string; count: number }[];
}> {
  return invoke("get_weekly_stats", { weekStart: weekStart ?? null });
}

// ---- Settings Management ----

export async function getSettings(): Promise<{
  storageMode: string;
  availableModes: string[];
  cloudConfigured: boolean;
}> {
  return invoke("get_settings");
}

export async function updateStorageMode(mode: string): Promise<{
  storageMode: string;
  message: string;
}> {
  return invoke("update_storage_mode", { mode });
}

// ---- Voice ----

export interface VoiceStatus {
  asr: boolean;
  tts: { available: boolean; provider: string };
  vad: { available: boolean; note: string };
}

export async function getVoiceStatus(): Promise<VoiceStatus> {
  return invoke("get_voice_status");
}

export async function getDaemonUrl(): Promise<string> {
  return invoke("get_daemon_url_command");
}

export async function getHealth(): Promise<{
  status: string;
  timestamp: string;
  storageMode: string;
  aiProvider: string;
  aiModel: string;
}> {
  return invoke("get_health");
}
