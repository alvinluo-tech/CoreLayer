export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  appSecret?: string;
}

export interface WhatsAppWebhookBody {
  object: string;
  entry: {
    id: string;
    changes: {
      value: {
        messaging_product: string;
        metadata: { display_phone_number: string; phone_number_id: string };
        contacts?: { wa_id: string; profile: { name: string } }[];
        messages?: {
          from: string;
          id: string;
          timestamp: string;
          type: "text" | "image" | "audio" | "video" | "document";
          text?: { body: string };
          image?: { id: string; mime_type: string; caption?: string };
          audio?: { id: string; mime_type: string };
          video?: { id: string; mime_type: string; caption?: string };
          document?: { id: string; mime_type: string; filename: string };
        }[];
      };
      field: string;
    }[];
  }[];
}
