/**
 * WeChat Channel — Message Normalizer
 *
 * Converts WeChat webhook body to ChannelInboundMessage.
 */

import type { ChannelInboundMessage, ChannelMessageContent } from "../../types.js";
import type { WeChatWebhookBody } from "./types.js";

export function normalizeWeChatMessage(
  body: WeChatWebhookBody,
): ChannelInboundMessage {
  const content = normalizeContent(body);

  return {
    channelId: "wechat",
    platformUserId: body.FromUserName,
    platformConversationId: body.FromUserName, // WeChat official account is 1:1
    content,
    metadata: {
      toUser: body.ToUserName,
      msgId: body.MsgId,
      msgType: body.MsgType,
    },
    timestamp: new Date(body.CreateTime * 1000).toISOString(),
  };
}

function normalizeContent(body: WeChatWebhookBody): ChannelMessageContent {
  switch (body.MsgType) {
    case "text":
      return { type: "text", text: body.Content ?? "" };

    case "image":
      return {
        type: "image",
        url: body.PicUrl ?? "",
        caption: body.Content,
      };

    case "voice":
      return {
        type: "audio",
        url: body.MediaId ?? "",
        // WeChat voice recognition (speech-to-text)
        ...(body.Recognition ? { transcription: body.Recognition } : {}),
      } as ChannelMessageContent;

    case "video":
    case "shortvideo":
      return {
        type: "file",
        url: body.MediaId ?? "",
        filename: body.Title ?? "video",
        mimeType: "video/mp4",
      };

    case "location":
      return {
        type: "text",
        text: `Location: ${body.Label ?? ""} (${body.Location_x}, ${body.Location_y})`,
      };

    case "link":
      return {
        type: "text",
        text: `${body.Title ?? ""}\n${body.Description ?? ""}\n${body.Content ?? ""}`,
      };

    case "event":
      return {
        type: "text",
        text: `[Event: ${body.Event ?? "unknown"}] ${body.EventKey ?? ""}`,
      };

    default:
      return { type: "text", text: body.Content ?? "" };
  }
}
