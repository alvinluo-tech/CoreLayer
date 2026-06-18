/**
 * Inbound Router — routes external platform messages to Jarvis internals.
 *
 * Flow: External Platform → ChannelAdapter.receive() → InboundRouter →
 *       ChannelMessageNormalizer → ConversationResolver → Agent Runtime
 */

import type {
  ChannelInboundMessage,
  ChannelConversation,
} from "./types.js";
import { getChannel } from "./registry.js";

export interface InboundRouteResult {
  /** The normalized inbound message */
  message: ChannelInboundMessage;
  /** Resolved Jarvis conversation ID */
  jarvisConversationId: string;
  /** Optional workspace ID if mapped */
  workspaceId?: string;
}

export interface ConversationResolver {
  /**
   * Resolve a platform conversation to a Jarvis conversation.
   * Creates a new mapping if one doesn't exist.
   */
  resolve(message: ChannelInboundMessage): Promise<ChannelConversation>;
}

/**
 * Process an inbound webhook request from a channel platform.
 *
 * 1. Look up the channel adapter by ID
 * 2. Verify webhook (if adapter supports it)
 * 3. Parse and normalize the inbound message
 * 4. Resolve to a Jarvis conversation
 */
export async function routeInbound(
  channelId: string,
  req: Request,
  resolver: ConversationResolver,
): Promise<InboundRouteResult> {
  const adapter = getChannel(channelId);
  if (!adapter) {
    throw new Error(`Channel not registered or disabled: ${channelId}`);
  }

  // Verify webhook signature if adapter supports it
  if (adapter.verifyWebhook) {
    const valid = await adapter.verifyWebhook(req);
    if (!valid) {
      throw new Error(`Webhook verification failed for channel: ${channelId}`);
    }
  }

  // Parse and normalize the inbound message
  const message = await adapter.receive(req);

  // Resolve to Jarvis conversation
  const conversation = await resolver.resolve(message);

  return {
    message,
    jarvisConversationId: conversation.jarvisConversationId,
    workspaceId: conversation.workspaceId,
  };
}
