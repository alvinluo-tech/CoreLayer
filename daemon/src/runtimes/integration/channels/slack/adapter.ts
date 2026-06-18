import type { ChannelAdapter, ChannelInboundMessage, ChannelOutboundMessage } from "../../types.js";
import type { SlackConfig, SlackEvent } from "./types.js";
import { createHmac } from "node:crypto";

export class SlackAdapter implements ChannelAdapter {
  readonly id = "slack";
  readonly name = "Slack";

  private config: SlackConfig;

  constructor(config: SlackConfig) {
    this.config = config;
  }

  async verifyWebhook(req: Request): Promise<boolean> {
    const timestamp = req.headers.get("X-Slack-Request-Timestamp") ?? "";
    const signature = req.headers.get("X-Slack-Signature") ?? "";
    const body = await req.text();

    const basestring = `v0:${timestamp}:${body}`;
    const hmac = createHmac("sha256", this.config.signingSecret)
      .update(basestring)
      .digest("hex");

    return signature === `v0=${hmac}`;
  }

  async receive(req: Request): Promise<ChannelInboundMessage> {
    const event: SlackEvent = await req.json();

    // Handle URL verification challenge
    if (event.challenge) {
      throw new Error("SLACK_CHALLENGE"); // Handled at webhook level
    }

    if (!event.event) throw new Error("No event in Slack payload");

    return {
      channelId: "slack",
      platformUserId: event.event.user,
      platformConversationId: event.event.channel,
      content: { type: "text", text: event.event.text },
      metadata: {
        threadTs: event.event.thread_ts,
        eventTs: event.event.ts,
        eventType: event.event.type,
      },
      timestamp: new Date(parseFloat(event.event.ts) * 1000).toISOString(),
    };
  }

  async send(message: ChannelOutboundMessage): Promise<void> {
    const text = message.content.type === "text"
      ? message.content.text
      : `[${message.content.type}]`;

    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.botToken}`,
      },
      body: JSON.stringify({
        channel: message.platformConversationId,
        text,
        thread_ts: message.replyToPlatformMessageId,
      }),
    });
  }
}
