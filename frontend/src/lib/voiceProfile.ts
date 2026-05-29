import type { VoiceProfile, VoiceConfig } from "@jarvis/types";

const DEFAULT_VOICE_PROFILE: VoiceProfile = {
  id: "moli",
  name: "茉莉",
  language: "zh-CN",
  model: "mimo-v2.5-tts",
  gender: "female",
  style: "warm",
};

const DEFAULT_CONFIG: VoiceConfig = {
  defaultProfileId: "moli",
  profiles: {
    moli: DEFAULT_VOICE_PROFILE,
  },
};

class VoiceProfileManager {
  private config: VoiceConfig;
  private activeProfile: VoiceProfile;

  constructor(config?: Partial<VoiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.activeProfile = this.config.profiles[this.config.defaultProfileId] ?? DEFAULT_VOICE_PROFILE;
  }

  getActiveProfile(): VoiceProfile {
    return this.activeProfile;
  }

  getVoiceName(): string {
    return this.activeProfile.name;
  }

  getTTSModel(): string {
    return this.activeProfile.model;
  }

  getLanguage(): string {
    return this.activeProfile.language;
  }

  setActiveProfile(profileId: string): void {
    const profile = this.config.profiles[profileId];
    if (!profile) {
      throw new Error(`Voice profile "${profileId}" not found`);
    }
    this.activeProfile = profile;
  }

  getAllProfiles(): VoiceProfile[] {
    return Object.values(this.config.profiles);
  }
}

export const voiceProfileManager = new VoiceProfileManager();
