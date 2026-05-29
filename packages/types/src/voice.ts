export interface VoiceProfile {
  id: string;
  name: string;
  language: string;
  model: string;
  gender: "male" | "female" | "neutral";
  style: string;
}

export interface VoiceConfig {
  defaultProfileId: string;
  profiles: Record<string, VoiceProfile>;
}
