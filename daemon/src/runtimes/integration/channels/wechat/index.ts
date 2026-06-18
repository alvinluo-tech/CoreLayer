/**
 * WeChat Channel — Public API
 */

export { WeChatAdapter } from "./adapter.js";
export { verifyWeChatSignature } from "./auth.js";
export { normalizeWeChatMessage } from "./message-normalizer.js";
export { createWeChatWebhookRoutes } from "./webhook.js";
export type { WeChatConfig, WeChatWebhookBody, WeChatReplyMessage } from "./types.js";
