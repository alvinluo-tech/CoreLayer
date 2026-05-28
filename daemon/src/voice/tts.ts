import { env } from "../config/env.js";

export type TTSModel = "mimo-v2.5-tts" | "mimo-v2.5-tts-voiceclone" | "mimo-v2.5-tts-voicedesign";

export interface TTSOptions {
  text: string;
  model?: TTSModel;
  voice?: string;
  speed?: number;
}

/**
 * Call MiMo TTS API and return audio buffer.
 * MiMo API is OpenAI-compatible: POST {baseURL}/audio/speech
 */
export async function synthesizeSpeech(options: TTSOptions): Promise<Buffer> {
  const {
    text,
    model = "mimo-v2.5-tts",
    voice = "alloy",
    speed = 1.0,
  } = options;

  if (!env.MIMO_API_KEY) {
    throw new Error("MIMO_API_KEY not configured");
  }

  const url = `${env.MIMO_API_URL}/audio/speech`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.MIMO_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      input: text,
      voice,
      speed,
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MiMo TTS error (${response.status}): ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Check if TTS is available (MiMo key configured).
 */
export function isTtsAvailable(): boolean {
  return Boolean(env.MIMO_API_KEY);
}
