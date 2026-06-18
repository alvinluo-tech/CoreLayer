/**
 * Integration/Channel Runtime — Public API
 *
 * Multi-channel messaging layer. External platforms connect here,
 * never directly to the Agent Runtime.
 */

// Core types and interfaces
export type {
  ChannelAdapter,
  ChannelInboundMessage,
  ChannelOutboundMessage,
  ChannelMessageContent,
  ChannelAccount,
  ChannelConversation,
  ChannelMessageRecord,
  ChannelRegistryEntry,
} from "./types.js";

// Channel registry
export {
  registerChannel,
  unregisterChannel,
  getChannel,
  getChannelEntry,
  getAllChannels,
  getEnabledChannels,
  setChannelEnabled,
} from "./registry.js";

// Inbound/outbound routing
export { routeInbound, type ConversationResolver, type InboundRouteResult } from "./inbound-router.js";
export { routeOutbound, routeOutboundRich, type OutboundRouteInput } from "./outbound-router.js";

// Channel runtime orchestration
export {
  ChannelRuntime,
  type AgentRunner,
  type AgentRunRequest,
  type AgentRunResult,
  type ChannelRuntimeConfig,
  type ChannelMessageStore,
} from "./channel-runtime.js";

// Channel adapters
export { WeChatAdapter } from "./channels/wechat/index.js";
export { TelegramAdapter } from "./channels/telegram/index.js";
export { WhatsAppAdapter } from "./channels/whatsapp/index.js";
export { EmailAdapter } from "./channels/email/index.js";
export { SlackAdapter } from "./channels/slack/index.js";

// DB schema for channel tables
export * as channelSchema from "./schema.js";
