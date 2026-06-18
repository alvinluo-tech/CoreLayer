import type { ChannelAdapter, ChannelInboundMessage, ChannelOutboundMessage } from "../../types.js";
import type { TelegramConfig, TelegramUpdate } from "./types.js";

export class TelegramAdapter implements ChannelAdapter {
  readonly id = "telegram";
  readonly name = "Telegram";

  private config: TelegramConfig;

  constructor(config: TelegramConfig) {
    this.config = config;
  }

  async verifyWebhook(req: Request): Promise<boolean> {
    if (!this.config.webhookSecret) return true;
    const secretToken = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    return secretToken === this.config.webhookSecret;
  }

  async receive(req: Request): Promise<ChannelInboundMessage> {
    const update: TelegramUpdate = await req.json();
    const msg = update.message;
    if (!msg) throw new Error("No message in Telegram update");

    const content = msg.text
      ? { type: "text" as const, text: msg.text }
      : msg.photo
        ? { type: "image" as const, url: msg.photo[msg.photo.length - 1].file_id }
        : msg.voice
          ? { type: "audio" as const, url: msg.voice.file_id }
          : msg.document
            ? { type: "file" as const, url: msg.document.file_id, filename: msg.document.file_name, mimeType: msg.document.mime_type }
            : { type: "text" as const, text: "[Unsupported message type]" };

    return {
      channelId: "telegram",
      platformUserId: String(msg.from.id),
      platformConversationId: String(msg.chat.id),
      content,
      metadata: {
        messageId: msg.message_id,
        firstName: msg.from.first_name,
        username: msg.from.username,
        chatType: msg.chat.type,
      },
      timestamp: new Date(msg.date * 1000).toISOString(),
    };
  }

  async send(message: ChannelOutboundMessage): Promise<void> {
    const text = message.content.type === "text"
      ? message.content.text
      : `[${message.content.type}]`;

    await fetch(`https://api.telegram.org/bot${this.config.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: message.platformConversationId,
        text,
        reply_to_message_id: message.replyToPlatformMessageId,
      }),
    });
  }
}
