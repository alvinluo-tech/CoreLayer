export interface EmailConfig {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  user: string;
  password: string;
  fromAddress: string;
}

export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  messageId?: string;
  inReplyTo?: string;
  attachments?: { filename: string; contentType: string; content: Buffer }[];
}
