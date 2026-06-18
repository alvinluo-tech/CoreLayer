/**
 * Outbound Router — routes Agent results back to external platforms.
 *
 * Flow: Agent Runtime result → OutboundRouter → ChannelAdapter.send() →
 *       External Platform
 */

import type {
  ChannelOutboundMessage,
  ChannelMessageContent,
} from "./types.js";
import { getChannel } from "./registry.js";

export interface OutboundRouteInput {
  /** Channel adapter ID to send through */
  channelId: string;
  /** Target platform conversation/chat ID */
  platformConversationId: string;
  /** Agent response text */
  text: string;
  /** Optional: reply to a specific platform message */
  replyToPlatformMessageId?: string;
}

/**
 * Route an agent response back to the originating channel platform.
 */
export async function routeOutbound(
  input: OutboundRouteInput,
): Promise<void> {
  const adapter = getChannel(input.channelId);
  if (!adapter) {
    throw new Error(`Channel not registered or disabled: ${input.channelId}`);
  }

  const content: ChannelMessageContent = {
    type: "text",
    text: input.text,
  };

  const message: ChannelOutboundMessage = {
    channelId: input.channelId,
    platformConversationId: input.platformConversationId,
    content,
    replyToPlatformMessageId: input.replyToPlatformMessageId,
  };

  await adapter.send(message);
}

/**
 * Route a rich content message back to the channel platform.
 */
export async function routeOutboundRich(
  channelId: string,
  platformConversationId: string,
  content: ChannelMessageContent,
  replyToPlatformMessageId?: string,
): Promise<void> {
  const adapter = getChannel(channelId);
  if (!adapter) {
    throw new Error(`Channel not registered or disabled: ${channelId}`);
  }

  const message: ChannelOutboundMessage = {
    channelId,
    platformConversationId,
    content,
    replyToPlatformMessageId,
  };

  await adapter.send(message);
}
