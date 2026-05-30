import Groq from "groq-sdk";
import { env } from "../config/env.js";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createReadStream } from "fs";

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

let groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (!groqClient) {
    groqClient = new Groq({ apiKey: env.GROQ_API_KEY });
  }
  return groqClient;
}

/**
 * Transcribe audio using Groq Whisper API.
 * @param audioBuffer - Audio file buffer (webm, mp3, wav, etc.)
 * @param filename - Original filename (used to determine format)
 * @param language - Optional language hint (e.g., "zh", "en")
 */
export async function transcribeWithGroq(
  audioBuffer: Buffer,
  filename: string = "audio.webm",
  language?: string,
): Promise<TranscriptionResult> {
  if (!env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY not configured");
  }

  const client = getGroqClient();

  // Write to temp file for Groq SDK compatibility
  const ext = filename.split(".").pop() || "webm";
  const tmpPath = join(tmpdir(), `jarvis-asr-${Date.now()}.${ext}`);
  await writeFile(tmpPath, audioBuffer);

  try {
    const transcription = await client.audio.transcriptions.create({
      file: createReadStream(tmpPath),
      model: "whisper-large-v3-turbo",
      response_format: "verbose_json",
      ...(language ? { language } : {}),
    });

    return {
      text: transcription.text.trim(),
      language: "language" in transcription ? (transcription as { language?: string }).language : undefined,
      duration: "duration" in transcription ? (transcription as { duration?: number }).duration : undefined,
    };
  } finally {
    await unlink(tmpPath).catch((e) => console.warn("[Jarvis][asr] Failed to clean up temp file:", tmpPath, e));
  }
}


/**
 * Check if ASR is available (Groq key configured).
 */
export function isAsrAvailable(): boolean {
  return Boolean(env.GROQ_API_KEY);
}
