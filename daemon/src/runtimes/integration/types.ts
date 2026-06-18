/**
 * Integration/Channel Runtime — Type Definitions
 *
 * Core types for the multi-channel integration layer.
 * External platforms never call models directly; they go through this layer.
 */

// ---- Channel Adapter Interface ----

export interface ChannelAdapter {
  /** Unique channel identifier (e.g., "wechat", "telegram") */
  readonly id: string;
  /** Human-readable channel name */
  readonly name: string;
  /** Verify incoming webhook signature (optional) */
  verifyWebhook?(req: Request): Promise<boolean>;
  /** Receive and normalize an inbound message from the platform */
  receive(req: Request): Promise<ChannelInboundMessage>;
  /** Send an outbound message back to the platform */
  send(message: ChannelOutboundMessage): Promise<void>;
}

// ---- Inbound Message (Platform → Jarvis) ----

export interface ChannelInboundMessage {
  /** Channel adapter ID that received this message */
  channelId: string;
  /** Platform-specific user identifier */
  platformUserId: string;
  /** Platform-specific conversation/chat identifier */
  platformConversationId: string;
  /** Normalized message content */
  content: ChannelMessageContent;
  /** Platform-specific metadata (group info, message type, etc.) */
  metadata: Record<string, unknown>;
  /** Timestamp of the original message */
  timestamp: string;
}

export type ChannelMessageContent =
  | { type: "text"; text: string }
  | { type: "image"; url: string; caption?: string }
  | { type: "audio"; url: string; duration?: number }
  | { type: "file"; url: string; filename: string; mimeType: string }
  | { type: "mixed"; parts: ChannelMessageContent[] };

// ---- Outbound Message (Jarvis → Platform) ----

export interface ChannelOutboundMessage {
  /** Target channel adapter ID */
  channelId: string;
  /** Platform-specific user/chat identifier */
  platformConversationId: string;
  /** Message content to send */
  content: ChannelMessageContent;
  /** Optional: reply to a specific platform message */
  replyToPlatformMessageId?: string;
}

// ---- Channel Account (persistent channel configuration) ----

export interface ChannelAccount {
  id: string;
  channelType: string;
  displayName: string;
  /** Platform-specific credentials/config (encrypted JSON) */
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---- Channel Conversation (maps platform conversation → Jarvis conversation) ----

export interface ChannelConversation {
  id: string;
  channelAccountId: string;
  platformConversationId: string;
  /** Mapped Jarvis conversation ID */
  jarvisConversationId: string;
  /** Mapped workspace ID (optional) */
  workspaceId?: string;
  /** Platform user metadata */
  platformUserMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ---- Channel Message Log ----

export interface ChannelMessageRecord {
  id: string;
  channelConversationId: string;
  direction: "inbound" | "outbound";
  content: string;
  platformMessageId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ---- Channel Registry Types ----

export interface ChannelRegistryEntry {
  adapter: ChannelAdapter;
  enabled: boolean;
  registeredAt: string;
}
