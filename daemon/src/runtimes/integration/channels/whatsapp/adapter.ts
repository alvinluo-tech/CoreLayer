import type { ChannelAdapter, ChannelInboundMessage, ChannelOutboundMessage } from "../../types.js";
import type { WhatsAppConfig, WhatsAppWebhookBody } from "./types.js";

export class WhatsAppAdapter implements ChannelAdapter {
  readonly id = "whatsapp";
  readonly name = "WhatsApp";

  private config: WhatsAppConfig;

  constructor(config: WhatsAppConfig) {
    this.config = config;
  }

  async verifyWebhook(req: Request): Promise<boolean> {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    if (mode === "subscribe" && token === this.config.verifyToken) {
      return true;
    }
    return false;
  }

  async receive(req: Request): Promise<ChannelInboundMessage> {
    const body: WhatsAppWebhookBody = await req.json();
    const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) throw new Error("No message in WhatsApp webhook");

    let content: ChannelInboundMessage["content"];
    switch (msg.type) {
      case "text":
        content = { type: "text", text: msg.text?.body ?? "" };
        break;
      case "image":
        content = { type: "image", url: msg.image?.id ?? "", caption: msg.image?.caption };
        break;
      case "audio":
        content = { type: "audio", url: msg.audio?.id ?? "" };
        break;
      case "video":
        content = { type: "file", url: msg.video?.id ?? "", filename: "video", mimeType: msg.video?.mime_type ?? "video/mp4" };
        break;
      case "document":
        content = { type: "file", url: msg.document?.id ?? "", filename: msg.document?.filename ?? "document", mimeType: msg.document?.mime_type ?? "application/octet-stream" };
        break;
      default:
        content = { type: "text", text: `[Unsupported: ${msg.type}]` };
    }

    return {
      channelId: "whatsapp",
      platformUserId: msg.from,
      platformConversationId: msg.from,
      content,
      metadata: { messageId: msg.id, timestamp: msg.timestamp },
      timestamp: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
    };
  }

  async send(message: ChannelOutboundMessage): Promise<void> {
    const text = message.content.type === "text"
      ? message.content.text
      : `[${message.content.type}]`;

    await fetch(
      `https://graph.facebook.com/v18.0/${this.config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: message.platformConversationId,
          type: "text",
          text: { body: text },
        }),
      },
    );
  }
}
