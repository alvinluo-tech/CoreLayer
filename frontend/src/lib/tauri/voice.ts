import { invoke } from '@tauri-apps/api/core';

export interface VoiceStatus {
  asr: boolean;
  tts: { available: boolean; provider: string };
  vad: { available: boolean; note: string };
}

export async function getVoiceStatus(): Promise<VoiceStatus> {
  return invoke('get_voice_status');
}
