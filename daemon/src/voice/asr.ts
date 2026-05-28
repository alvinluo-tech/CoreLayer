import Groq from "groq-sdk";
import { env } from "../config/env.js";

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

  // Create a File-like object from buffer
  const file = new File([new Uint8Array(audioBuffer)], filename, {
    type: getAudioMimeType(filename),
  });

  const transcription = await client.audio.transcriptions.create({
    file,
    model: "whisper-large-v3-turbo",
    response_format: "verbose_json",
    ...(language ? { language } : {}),
  });

  return {
    text: transcription.text.trim(),
    language: "language" in transcription ? (transcription as { language?: string }).language : undefined,
    duration: "duration" in transcription ? (transcription as { duration?: number }).duration : undefined,
  };
}

function getAudioMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "mp3": return "audio/mpeg";
    case "wav": return "audio/wav";
    case "webm": return "audio/webm";
    case "ogg": return "audio/ogg";
    case "m4a": return "audio/mp4";
    default: return "audio/webm";
  }
}

/**
 * Check if ASR is available (Groq key configured).
 */
export function isAsrAvailable(): boolean {
  return Boolean(env.GROQ_API_KEY);
}
