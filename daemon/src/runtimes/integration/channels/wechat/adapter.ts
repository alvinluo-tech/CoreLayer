/**
 * WeChat Channel — Adapter Implementation
 *
 * Implements ChannelAdapter for WeChat Official Account / Mini Program.
 */

import type { ChannelAdapter, ChannelInboundMessage, ChannelOutboundMessage } from "../../types.js";
import type { WeChatConfig } from "./types.js";
import { verifyWeChatSignature } from "./auth.js";
import { normalizeWeChatMessage } from "./message-normalizer.js";

export class WeChatAdapter implements ChannelAdapter {
  readonly id = "wechat";
  readonly name = "WeChat";

  private config: WeChatConfig;

  constructor(config: WeChatConfig) {
    this.config = config;
  }

  async verifyWebhook(req: Request): Promise<boolean> {
    const url = new URL(req.url);
    const signature = url.searchParams.get("signature") ?? "";
    const timestamp = url.searchParams.get("timestamp") ?? "";
    const nonce = url.searchParams.get("nonce") ?? "";

    return verifyWeChatSignature(this.config, signature, timestamp, nonce);
  }

  async receive(req: Request): Promise<ChannelInboundMessage> {
    const body = await req.json();
    return normalizeWeChatMessage(body);
  }

  async send(message: ChannelOutboundMessage): Promise<void> {
    // WeChat reply format (XML in production)
    const reply = {
      ToUserName: message.platformConversationId,
      FromUserName: this.config.appId,
      CreateTime: Math.floor(Date.now() / 1000),
      MsgType: "text",
      Content: this.extractText(message.content),
    };

    // In production: POST to WeChat API or return in webhook response
    console.log("[WeChat] Sending reply:", reply);
  }

  private extractText(content: ChannelOutboundMessage["content"]): string {
    switch (content.type) {
      case "text":
        return content.text;
      case "image":
        return content.caption ?? "[Image]";
      case "audio":
        return "[Audio]";
      case "file":
        return `[File: ${content.filename}]`;
      case "mixed":
        return content.parts.map((p) => this.extractText(p)).join("\n");
    }
  }
}
