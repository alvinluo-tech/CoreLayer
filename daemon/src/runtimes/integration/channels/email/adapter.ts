import type { ChannelAdapter, ChannelInboundMessage, ChannelOutboundMessage } from "../../types.js";
import type { EmailConfig, EmailMessage } from "./types.js";

export class EmailAdapter implements ChannelAdapter {
  readonly id = "email";
  readonly name = "Email";

  constructor(_config: EmailConfig) {
    // config stored for future SMTP transport setup
  }

  // Email doesn't use webhooks in the traditional sense
  // This would be called by an IMAP polling loop or inbound SMTP handler
  async receive(_req: Request): Promise<ChannelInboundMessage> {
    throw new Error("Email adapter: use fromEmailMessage() for direct message processing");
  }

  /** Convert a parsed email to ChannelInboundMessage */
  fromEmailMessage(msg: EmailMessage): ChannelInboundMessage {
    const hasAttachments = msg.attachments && msg.attachments.length > 0;

    return {
      channelId: "email",
      platformUserId: msg.from,
      platformConversationId: msg.from,
      content: hasAttachments
        ? {
            type: "mixed",
            parts: [
              { type: "text", text: msg.textBody },
              ...(msg.attachments?.map((a) => ({
                type: "file" as const,
                url: "",
                filename: a.filename,
                mimeType: a.contentType,
              })) ?? []),
            ],
          }
        : { type: "text", text: msg.textBody },
      metadata: {
        subject: msg.subject,
        messageId: msg.messageId,
        inReplyTo: msg.inReplyTo,
        htmlBody: msg.htmlBody,
      },
      timestamp: new Date().toISOString(),
    };
  }

  async send(message: ChannelOutboundMessage): Promise<void> {
    const text = message.content.type === "text"
      ? message.content.text
      : `[${message.content.type}]`;

    // In production: use nodemailer or similar to send via SMTP
    console.log("[Email] Sending to:", message.platformConversationId, text);
  }

  /** Send an email directly (not through ChannelOutboundMessage) */
  async sendEmail(to: string, subject: string, text: string): Promise<void> {
    console.log("[Email] Sending:", { to, subject, text });
    // Production: use nodemailer SMTP transport
  }
}
