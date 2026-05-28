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
 * MiMo TTS uses chat completions endpoint with assistant role.
 * Response contains base64-encoded WAV audio in choices[0].message.audio.data.
 */
export async function synthesizeSpeech(options: TTSOptions): Promise<Buffer> {
  const {
    text,
    model = "mimo-v2.5-tts",
  } = options;

  if (!env.MIMO_API_KEY) {
    throw new Error("MIMO_API_KEY not configured");
  }

  const url = `${env.MIMO_API_URL}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.MIMO_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "user", content: "请用自然的语气说话" },
        { role: "assistant", content: text },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MiMo TTS error (${response.status}): ${errorText}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{
      message?: {
        audio?: {
          data?: string;
        };
      };
    }>;
  };

  const audioData = json.choices?.[0]?.message?.audio?.data;
  if (!audioData) {
    throw new Error("MiMo TTS: no audio data in response");
  }

  return Buffer.from(audioData, "base64");
}

/**
 * Check if TTS is available (MiMo key configured).
 */
export function isTtsAvailable(): boolean {
  return Boolean(env.MIMO_API_KEY);
}
