export interface TelegramConfig {
  botToken: string;
  webhookSecret?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    photo?: { file_id: string; file_unique_id: string }[];
    document?: { file_id: string; file_name: string; mime_type: string };
    voice?: { file_id: string; duration: number };
    date: number;
  };
}
