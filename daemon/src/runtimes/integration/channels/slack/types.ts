export interface SlackConfig {
  botToken: string;
  signingSecret: string;
  appToken?: string; // for Socket Mode
}

export interface SlackEvent {
  type: string;
  event?: {
    type: string;
    user: string;
    text: string;
    channel: string;
    ts: string;
    thread_ts?: string;
  };
  challenge?: string;
  token?: string;
}
