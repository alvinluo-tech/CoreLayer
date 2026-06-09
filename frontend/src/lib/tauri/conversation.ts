import { invoke } from '@tauri-apps/api/core';

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
  modelUsed?: string | null;
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

export async function deleteConversations(ids: string[]): Promise<{ deleted: number }> {
  return invoke('delete_conversations', { ids });
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
