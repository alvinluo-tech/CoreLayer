/**
 * WeChat Channel — Type Definitions
 */

export interface WeChatConfig {
  appId: string;
  appSecret: string;
  token: string;
  encodingAesKey?: string;
}

export interface WeChatWebhookBody {
  ToUserName: string;
  FromUserName: string;
  CreateTime: number;
  MsgType: "text" | "image" | "voice" | "video" | "shortvideo" | "location" | "link" | "event";
  Content?: string;
  MsgId?: string;
  MediaId?: string;
  PicUrl?: string;
  Format?: string;
  Recognition?: string;
  Title?: string;
  Description?: string;
  Location_x?: number;
  Location_y?: number;
  Scale?: number;
  Label?: string;
  Event?: string;
  EventKey?: string;
}

export interface WeChatReplyMessage {
  ToUserName: string;
  FromUserName: string;
  CreateTime: number;
  MsgType: string;
  Content?: string;
  Image?: { MediaId: string };
  Voice?: { MediaId: string };
  Video?: { MediaId: string; Title?: string; Description?: string };
}
