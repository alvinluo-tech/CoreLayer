import { Hono } from "hono";
import { transcribeWithGroq, isAsrAvailable } from "../voice/asr.js";
import { synthesizeSpeech, isTtsAvailable, type TTSModel } from "../voice/tts.js";

const voiceRoutes = new Hono();

/**
 * POST /api/voice/transcribe
 * Accepts audio file upload, returns transcription text.
 */
voiceRoutes.post("/transcribe", async (c) => {
  if (!isAsrAvailable()) {
    return c.json({ error: "ASR not configured. Set GROQ_API_KEY." }, 503);
  }

  try {
    const formData = await c.req.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof File)) {
      return c.json({ error: "Missing audio file" }, 400);
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    const filename = audioFile.name || "audio.webm";

    const language = formData.get("language") as string | null;
    const result = await transcribeWithGroq(audioBuffer, filename, language ?? undefined);

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /api/voice/synthesize
 * Accepts text, returns audio binary (MP3).
 * Body: { text, model?, voice?, speed? }
 */
voiceRoutes.post("/synthesize", async (c) => {
  if (!isTtsAvailable()) {
    return c.json({ error: "TTS not configured. Set MIMO_API_KEY." }, 503);
  }

  try {
    const body = await c.req.json<{
      text: string;
      model?: TTSModel;
      voice?: string;
      speed?: number;
    }>();

    if (!body.text?.trim()) {
      return c.json({ error: "Text is required" }, 400);
    }

    // Truncate very long text to avoid API limits
    const text = body.text.length > 2000 ? body.text.slice(0, 2000) + "..." : body.text;

    const audioBuffer = await synthesizeSpeech({
      text,
      model: body.model,
      voice: body.voice,
      speed: body.speed,
    });

    return new Response(new Uint8Array(audioBuffer), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.length.toString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /api/voice/status
 * Returns voice pipeline availability.
 */
voiceRoutes.get("/status", (c) => {
  return c.json({
    asr: isAsrAvailable(),
    tts: isTtsAvailable(),
    ttsModels: ["mimo-v2.5-tts", "mimo-v2.5-tts-voiceclone", "mimo-v2.5-tts-voicedesign"],
  });
});

export default voiceRoutes;
