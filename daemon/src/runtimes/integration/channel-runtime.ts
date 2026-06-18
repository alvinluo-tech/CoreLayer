/**
 * Channel Runtime — orchestration layer for multi-channel messaging.
 *
 * Connects external channels to the Agent Runtime without coupling them.
 * External platforms never call models directly; they go through this layer.
 *
 * Core flow:
 *   WeChat/WhatsApp/Telegram → ChannelAdapter.receive()
 *     → ChannelMessageNormalizer → ConversationResolver
 *     → Agent Runtime → Tool/Permission/Memory
 *     → OutboundRouter → ChannelAdapter.send() → External Platform
 */

import type {
  ChannelAdapter,
  ChannelInboundMessage,
  ChannelMessageRecord,
} from "./types.js";
import { getChannel, getEnabledChannels } from "./registry.js";
import {
  routeInbound,
  type ConversationResolver,
} from "./inbound-router.js";
import { routeOutbound, type OutboundRouteInput } from "./outbound-router.js";

// ---- Agent Runtime Interface (loose coupling) ----

export interface AgentRunRequest {
  conversationId: string;
  message: string;
  workspaceId?: string;
  channelId: string;
  platformConversationId: string;
}

export interface AgentRunResult {
  text: string;
  conversationId: string;
  runId: string;
}

export interface AgentRunner {
  /** Run the agent and return a response */
  run(request: AgentRunRequest): Promise<AgentRunResult>;
}

// ---- Message Store (persistence interface) ----

export interface ChannelMessageStore {
  /** Log an inbound/outbound message */
  logMessage(record: Omit<ChannelMessageRecord, "id" | "createdAt">): Promise<ChannelMessageRecord>;
  /** Get message history for a conversation */
  getMessages(channelConversationId: string, limit?: number): Promise<ChannelMessageRecord[]>;
}

// ---- Channel Runtime ----

export interface ChannelRuntimeConfig {
  agentRunner: AgentRunner;
  conversationResolver: ConversationResolver;
  messageStore?: ChannelMessageStore;
}

export class ChannelRuntime {
  private agentRunner: AgentRunner;
  private conversationResolver: ConversationResolver;
  private messageStore?: ChannelMessageStore;

  constructor(config: ChannelRuntimeConfig) {
    this.agentRunner = config.agentRunner;
    this.conversationResolver = config.conversationResolver;
    this.messageStore = config.messageStore;
  }

  /**
   * Handle an inbound webhook from any channel.
   * Routes the message through normalization → resolution → agent → reply.
   */
  async handleInbound(channelId: string, req: Request): Promise<void> {
    // 1. Route inbound: verify → parse → normalize → resolve
    const routeResult = await routeInbound(
      channelId,
      req,
      this.conversationResolver,
    );

    // 2. Log inbound message
    if (this.messageStore) {
      await this.messageStore.logMessage({
        channelConversationId: routeResult.jarvisConversationId,
        direction: "inbound",
        content: this.extractText(routeResult.message.content),
        metadata: routeResult.message.metadata,
      });
    }

    // 3. Run agent
    const agentResult = await this.agentRunner.run({
      conversationId: routeResult.jarvisConversationId,
      message: this.extractText(routeResult.message.content),
      workspaceId: routeResult.workspaceId,
      channelId,
      platformConversationId: routeResult.message.platformConversationId,
    });

    // 4. Log outbound message
    if (this.messageStore) {
      await this.messageStore.logMessage({
        channelConversationId: routeResult.jarvisConversationId,
        direction: "outbound",
        content: agentResult.text,
        metadata: { runId: agentResult.runId },
      });
    }

    // 5. Route outbound reply to the platform
    await routeOutbound({
      channelId,
      platformConversationId: routeResult.message.platformConversationId,
      text: agentResult.text,
    });
  }

  /**
   * Send a proactive message through a channel (not in response to inbound).
   */
  async sendProactive(input: OutboundRouteInput): Promise<void> {
    await routeOutbound(input);
  }

  /**
   * Get all registered and enabled channel adapters.
   */
  getActiveChannels(): ChannelAdapter[] {
    return getEnabledChannels();
  }

  /**
   * Check if a specific channel is registered and enabled.
   */
  isChannelActive(channelId: string): boolean {
    return getChannel(channelId) !== undefined;
  }

  private extractText(content: ChannelInboundMessage["content"]): string {
    switch (content.type) {
      case "text":
        return content.text;
      case "image":
        return content.caption ?? "[Image]";
      case "audio":
        return "[Audio message]";
      case "file":
        return `[File: ${content.filename}]`;
      case "mixed":
        return content.parts
          .map((p) => this.extractText(p))
          .join("\n");
    }
  }
}
