import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { transcribeWithGroq, isAsrAvailable } from "../voice/asr.js";
import { synthesizeSpeech, isTtsAvailable, type TTSModel } from "../voice/tts.js";
import { streamChat } from "../orchestrator/conversation.js";
import { getRepositories } from "../db/factory.js";
import { env } from "../config/env.js";
import { getProviderConfig } from "../ai/provider.js";
import { configManager } from "../config/config-manager.js";
import { extractErrorMessage, logError } from "../utils/errors.js";
import { normalizeStream } from "./sse-normalizer.js";
import { withStreamTimeout } from "./stream-timeout.js";
import type { ModelMessage } from "ai";

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
        "Content-Type": "audio/wav",
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
    wakeWord: !!(env.PORCUPINE_ACCESS_KEY || null),
  });
});

/**
 * POST /api/voice/converse-stream
 * Streaming voice conversation: LLM streams text, frontend handles TTS chunking.
 * Body: { message: string, conversationId?: string }
 * Response: SSE stream with token/done/error events.
 */
voiceRoutes.post("/converse-stream", async (c) => {
  const body = await c.req.json<{ message: string; conversationId?: string }>().catch(() => null);
  if (!body?.message?.trim()) {
    return c.json({ error: "消息不能为空" }, 400);
  }

  const repo = getRepositories().conversations;
  let conversationId = body.conversationId;
  let messages: ModelMessage[];

  try {
    if (!conversationId) {
      const conv = await repo.create("Voice Chat");
      conversationId = conv.id;
    }

    await repo.addMessage(conversationId, {
      role: "user",
      content: body.message,
    });

    const history = await repo.getMessages(conversationId);
    messages = history.slice(-20).map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Failed to initialize conversation: ${message}` }, 500);
  }

  return streamSSE(c, async (sseStream) => {
    let fullText = "";
    const toolCallsLog: { name: string; input: unknown; output: unknown }[] = [];
    const toolCallIndexByCallId = new Map<string, number>();

    const result = await streamChat(messages, "voice", conversationId, async (event) => {
      if (event.type === 'tool-call') {
        const index = toolCallsLog.length;
        toolCallsLog.push({ name: event.name, input: event.args ?? null, output: null });
        toolCallIndexByCallId.set(event.toolCallId, index);
        await sseStream.writeSSE({
          event: 'tool_calls',
          data: JSON.stringify({ name: event.name, toolCallId: event.toolCallId, input: event.args }),
        });
      } else if (event.type === 'tool-result') {
        const index = toolCallIndexByCallId.get(event.toolCallId);
        if (index !== undefined && toolCallsLog[index]) {
          toolCallsLog[index].output = event.result;
        }
        await sseStream.writeSSE({
          event: 'tool_result',
          data: JSON.stringify({ name: event.name, toolCallId: event.toolCallId, output: event.result }),
        });
      }
    });

    try {
      const timeoutMs = configManager.getStreamTimeout();
      const normalized = withStreamTimeout(
        normalizeStream(result.fullStream),
        timeoutMs,
      );

      for await (const event of normalized) {
        if (event.type === "delta") {
          fullText += event.text;
          await sseStream.writeSSE({
            event: "delta",
            data: JSON.stringify({ text: event.text }),
          });
        } else if (event.type === "thinking") {
          await sseStream.writeSSE({
            event: "thinking",
            data: JSON.stringify({ text: event.text }),
          });
        }
      }

      await repo.addMessage(conversationId!, {
        role: "assistant",
        content: fullText,
      });

      await sseStream.writeSSE({
        event: "done",
        data: JSON.stringify({ fullText, conversationId }),
      });
    } catch (error) {
      logError("voice/converse-stream", error);
      const message = extractErrorMessage(error);
      await sseStream.writeSSE({
        event: "error",
        data: JSON.stringify({ error: message }),
      });
    }
  });
});

/**
 * POST /api/voice/realtime-session
 * Fetches an ephemeral token from OpenAI Realtime API for direct WebRTC / WebSocket connections.
 */
voiceRoutes.post("/realtime-session", async (c) => {
  try {
    let apiKey = "";
    try {
      const config = getProviderConfig("openai");
      apiKey = config.apiKey;
    } catch {
      // Fallback to environment variables
      apiKey = process.env.OPENAI_API_KEY || env.GROQ_API_KEY || ""; 
    }

    if (!apiKey) {
      return c.json({ error: "OpenAI API Key 未配置，请在模型配置中添加 OpenAI 提供商" }, 400);
    }

    // Call OpenAI Realtime Client Secrets endpoint (GA standard)
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview",
        modalities: ["audio", "text"],
        voice: "alloy",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      const status = response.status >= 400 && response.status < 600 ? response.status as 400 | 401 | 403 | 404 | 500 | 503 : 500;
      return c.json({ error: `Failed to create OpenAI Realtime session: ${errText}` }, status);
    }

    const data = await response.json();
    return c.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 500);
  }
});

export default voiceRoutes;
