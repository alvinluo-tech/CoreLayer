import { invoke } from '@tauri-apps/api/core';

export interface ChatResponse {
  reply: string;
  toolCalls: { name: string; args: unknown; result: unknown }[];
}

export async function sendChatMessage(message: string): Promise<ChatResponse> {
  return invoke<ChatResponse>('send_message', { message });
}

export async function getHealthStatus(): Promise<{ status: string; timestamp: string }> {
  return invoke('health_check');
}
