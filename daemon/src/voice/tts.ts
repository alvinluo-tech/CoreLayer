import { env } from "../config/env.js";
import { configManager } from "../config/config-manager.js";

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
    voice,
    speed,
  } = options;

  const mimoApiKey = configManager.getCredentials()["mimo"] || env.MIMO_API_KEY;
  if (!mimoApiKey) {
    throw new Error("MIMO_API_KEY not configured");
  }

  // Voice mapping: use stable preset voice "茉莉" for mimo-v2.5-tts by default
  let selectedVoice = voice;
  if (model === "mimo-v2.5-tts") {
    if (!selectedVoice || selectedVoice === "female-tianmei") {
      selectedVoice = "茉莉";
    }
  }

  // Map speed to natural language style instruction suffix
  let instruction = "请用自然的语气说话";
  if (speed && speed !== 1.0) {
    if (speed > 1.2) {
      instruction += "，语速稍微快一点";
    } else if (speed < 0.8) {
      instruction += "，语速稍微慢一点";
    }
  }

  const mimoApiUrl = configManager.getProviderConfig("mimo").baseURL || env.MIMO_API_URL;
  const url = `${mimoApiUrl}/chat/completions`;

  const audioConfig: Record<string, string> = {
    format: "wav",
  };
  if (selectedVoice) {
    audioConfig.voice = selectedVoice;
  }

  // Robust markdown stripper to prevent TTS from reading raw markdown symbols or alert markers
  const cleanText = text
    .replace(/[*#`_\-~]/g, "") // Strip bold, italics, headings, backticks, strikethroughs, and bullet dashes
    .replace(/\[!.*?\]/g, "") // Strip alert blocks like [!NOTE]
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1") // Convert links [text](url) to just the text
    .replace(/<thought>[\s\S]*?<\/thought>/gi, "") // Guarantee thoughts are fully excluded (safety fallback)
    .replace(/\n+/g, "，") // Convert newlines to commas for smooth pausing
    .trim();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${mimoApiKey}`,
    },
    body: JSON.stringify({
      model,
      modalities: ["text", "audio"],
      audio: audioConfig,
      messages: [
        { role: "user", content: instruction },
        { role: "assistant", content: cleanText || text },
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
  return Boolean(configManager.getCredentials()["mimo"] || env.MIMO_API_KEY);
}
