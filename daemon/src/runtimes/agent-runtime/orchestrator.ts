/**
 * Orchestrator — bridges agent-runtime with existing ai/orchestrator modules.
 *
 * This module wraps the existing conversation.ts and provider.ts code,
 * providing a clean interface for the agent-runtime.
 */

import { configManager } from "../../config/config-manager.js";

export interface AgentRunInput {
  conversationId: string;
  message: string;
  model?: string;
  signal?: AbortSignal;
}

export interface AgentRunOutput {
  reply: string;
  toolCalls: { name: string; args: unknown; result: unknown }[];
  usage?: { promptTokens: number; completionTokens: number };
}

/**
 * Execute an agent run using the existing orchestrator code.
 */
export async function executeAgentRun(
  input: AgentRunInput,
): Promise<AgentRunOutput> {
  // Dynamically import to avoid circular dependencies
  const { handleMessageInConversation } = await import(
    "../../orchestrator/conversation.js"
  );

  const result = await handleMessageInConversation(
    input.conversationId,
    input.message,
    {
      modelOverride: input.model ?? configManager.getActiveModel(),
    },
  );

  return {
    reply: result.assistantMessage.content,
    toolCalls: [],
    usage: undefined,
  };
}

/**
 * Check if AI is configured.
 */
export function isAiConfigured(): boolean {
  const creds = configManager.getCredentials();
  return Object.values(creds).some((v) => v);
}

/**
 * Get active model.
 */
export function getActiveModel(): string {
  return configManager.getActiveModel();
}
