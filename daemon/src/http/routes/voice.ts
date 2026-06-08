import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { transcribeWithGroq, isAsrAvailable, synthesizeSpeech, isTtsAvailable, type TTSModel, StreamingTTS, voiceRegistry } from "../../runtimes/voice/public-api.js";
import { getProviderConfig } from "../../gateways/ai-provider/provider.js";
import { configManager } from "../../config/config-manager.js";
import { extractErrorMessage, logError } from "../../shared/errors.js";
import { runStreamTurn } from "../../runtimes/agent/public-api.js";

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
 * POST /api/voice/synthesize-batch
 * Batch TTS synthesis: accepts multiple sentences, returns ordered audio chunks.
 * Body: { sentences: string[], model?, voice?, speed? }
 * Response: { chunks: ArrayBuffer[] } (each chunk is a WAV buffer)
 */
voiceRoutes.post("/synthesize-batch", async (c) => {
  if (!isTtsAvailable()) {
    return c.json({ error: "TTS not configured. Set MIMO_API_KEY." }, 503);
  }

  try {
    const body = await c.req.json<{
      sentences: string[];
      model?: TTSModel;
      voice?: string;
      speed?: number;
    }>();

    if (!body.sentences?.length) {
      return c.json({ error: "sentences array is required" }, 400);
    }

    // Process sentences in parallel (limited concurrency to avoid rate limits)
    const results = await Promise.all(
      body.sentences.map(async (text) => {
        const trimmed = text.length > 2000 ? text.slice(0, 2000) + "..." : text;
        const audioBuffer = await synthesizeSpeech({
          text: trimmed,
          model: body.model,
          voice: body.voice,
          speed: body.speed,
        });
        return audioBuffer;
      })
    );

    // Return as JSON with base64-encoded audio chunks
    const chunks = results.map((buf) => Buffer.from(buf).toString("base64"));
    return c.json({ chunks });
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
    providers: {
      asr: voiceRegistry.getAvailableASR().map((p) => p.name),
      tts: voiceRegistry.getAvailableTTS().map((p) => p.name),
    },
    ttsModels: ["mimo-v2.5-tts", "mimo-v2.5-tts-voiceclone", "mimo-v2.5-tts-voicedesign"],
    wakeWord: Boolean(configManager.getCredentials()["porcupine"]),
  });
});

/**
 * POST /api/voice/converse-stream
 * Streaming voice conversation: LLM streams text, frontend handles TTS chunking.
 * Routes through runStreamTurn for AgentRun lifecycle tracking.
 * Body: { message: string, conversationId?: string }
 * Response: SSE stream with delta/tool_calls/tool_result/done/error events.
 */
voiceRoutes.post("/converse-stream", async (c) => {
  const body = await c.req.json<{
    message: string;
    conversationId?: string;
    workspaceId?: string;
    projectId?: string;
    agentId?: string;
  }>().catch(() => null);
  if (!body?.message?.trim()) {
    return c.json({ error: "消息不能为空" }, 400);
  }

  const abortController = new AbortController();

  c.req.raw.signal.addEventListener("abort", () => {
    logError("[VoiceStream] client disconnected, aborting upstream", new Error("client disconnect"));
    abortController.abort();
  });

  let result;
  try {
    result = await runStreamTurn(
      {
        workspaceId: body.workspaceId,
        projectId: body.projectId,
        conversationId: body.conversationId,
        agentId: body.agentId,
        mode: "voice",
        input: body.message,
      },
      { abortController },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Failed to initialize voice run: ${message}` }, 500);
  }

  return streamSSE(c, async (sseStream) => {
    try {
      for await (const event of result.stream) {
        if (event.type === "delta") {
          await sseStream.writeSSE({
            event: "delta",
            data: JSON.stringify({ text: event.text }),
          });
        } else if (event.type === "tool_call") {
          if (event.toolCall.result !== undefined) {
            await sseStream.writeSSE({
              event: "tool_result",
              data: JSON.stringify({ name: event.toolCall.name, toolCallId: event.toolCall.id ?? "", output: event.toolCall.result }),
            });
          } else {
            await sseStream.writeSSE({
              event: "tool_calls",
              data: JSON.stringify({ name: event.toolCall.name, toolCallId: event.toolCall.id ?? "", input: event.toolCall.args }),
            });
          }
        } else if (event.type === "run_completed") {
          await sseStream.writeSSE({
            event: "done",
            data: JSON.stringify({ fullText: event.result.text, conversationId: event.result.conversationId, runId: result.runId }),
          });
        } else if (event.type === "run_failed") {
          await sseStream.writeSSE({
            event: "error",
            data: JSON.stringify({ error: event.error }),
          });
        }
      }
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
 * POST /api/voice/converse-voice-stream
 * Streaming voice conversation with server-side TTS.
 * Routes through runStreamTurn for AgentRun lifecycle tracking.
 * LLM streams text → server splits into sentences → synthesizes audio in parallel →
 * SSE events: delta (text), tts_audio (base64 WAV), done, error.
 *
 * Body: { message: string, conversationId?: string, voice?: string, speed?: number }
 */
voiceRoutes.post("/converse-voice-stream", async (c) => {
  const body = await c.req.json<{
    message: string;
    conversationId?: string;
    workspaceId?: string;
    projectId?: string;
    agentId?: string;
    voice?: string;
    speed?: number;
  }>().catch(() => null);

  if (!body?.message?.trim()) {
    return c.json({ error: "消息不能为空" }, 400);
  }

  const abortController = new AbortController();

  c.req.raw.signal.addEventListener("abort", () => {
    abortController.abort();
  });

  let result;
  try {
    result = await runStreamTurn(
      {
        workspaceId: body.workspaceId,
        projectId: body.projectId,
        conversationId: body.conversationId,
        agentId: body.agentId,
        mode: "voice",
        input: body.message,
      },
      { abortController },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Failed to initialize voice run: ${message}` }, 500);
  }

  return streamSSE(c, async (sseStream) => {
    const streamingTTS = new StreamingTTS({
      voice: body.voice,
      speed: body.speed,
    });

    streamingTTS.onAudio(async (chunk) => {
      try {
        await sseStream.writeSSE({
          event: "tts_audio",
          data: JSON.stringify({
            text: chunk.text,
            audio: Buffer.from(chunk.audio).toString("base64"),
            index: chunk.index,
          }),
        });
      } catch {
        // Stream may have been closed by client disconnect
      }
    });

    try {
      for await (const event of result.stream) {
        if (event.type === "delta") {
          // Feed text to streaming TTS for sentence detection
          streamingTTS.feed(event.text);
          await sseStream.writeSSE({
            event: "delta",
            data: JSON.stringify({ text: event.text }),
          });
        } else if (event.type === "run_completed") {
          const ttsChunks = await streamingTTS.flush();
          await sseStream.writeSSE({
            event: "done",
            data: JSON.stringify({
              fullText: event.result.text,
              conversationId: event.result.conversationId,
              runId: result.runId,
              ttsChunks: ttsChunks.length,
            }),
          });
        } else if (event.type === "run_failed") {
          await sseStream.writeSSE({
            event: "error",
            data: JSON.stringify({ error: event.error }),
          });
        }
      }
    } catch (error) {
      logError("voice/converse-voice-stream", error);
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
      apiKey = "";
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

/**
 * GET /api/voice/providers
 * Returns all registered voice provider definitions with availability status.
 */
voiceRoutes.get("/providers", (c) => {
  const definitions = voiceRegistry.getDefinitions();
  const result = definitions.map((def) => {
    const isAsr = def.kind === "asr" || def.kind === "both";
    const isTts = def.kind === "tts" || def.kind === "both";

    let available = false;
    if (isAsr) {
      const asr = voiceRegistry.getASR(def.id);
      if (asr?.isAvailable()) available = true;
    }
    if (isTts) {
      const tts = voiceRegistry.getTTS(def.id);
      if (tts?.isAvailable()) available = true;
    }

    return {
      id: def.id,
      name: def.name,
      kind: def.kind,
      models: def.models,
      voices: def.voices,
      requiresApiKey: def.requiresApiKey,
      localOnly: def.localOnly,
      available,
      hasApiKey: configManager.getCredentials()[def.credentialKey] ? true : false,
    };
  });

  return c.json({ providers: result });
});

/**
 * GET /api/voice/config
 * Returns current voice configuration.
 */
voiceRoutes.get("/config", (c) => {
  const voiceConfig = configManager.getVoiceConfig();
  return c.json({
    asrProvider: voiceConfig.asrProvider ?? "",
    asrModel: voiceConfig.asrModel ?? "",
    ttsProvider: voiceConfig.ttsProvider ?? "",
    ttsModel: voiceConfig.ttsModel ?? "mimo-v2.5-tts",
    ttsVoice: voiceConfig.ttsVoice ?? "茉莉",
    ttsSpeed: voiceConfig.ttsSpeed ?? 1.0,
  });
});

/**
 * PUT /api/voice/config
 * Save voice configuration. Body: { asrProvider?, asrModel?, ttsProvider?, ttsModel?, ttsVoice?, ttsSpeed? }
 * For API key updates, use PUT /api/voice/credentials.
 */
voiceRoutes.put("/config", async (c) => {
  const body = await c.req.json<{
    asrProvider?: string;
    asrModel?: string;
    ttsProvider?: string;
    ttsModel?: string;
    ttsVoice?: string;
    ttsSpeed?: number;
  }>().catch(() => null);

  if (!body) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  configManager.updateVoiceConfig(body);
  return c.json({ success: true, config: configManager.getVoiceConfig() });
});

/**
 * PUT /api/voice/credentials
 * Update API key for a voice provider. Body: { providerId, apiKey }
 * Keys are stored in credentials.json (temporary path — migrate to SecretStore when ready).
 */
voiceRoutes.put("/credentials", async (c) => {
  const body = await c.req.json<{ providerId: string; apiKey: string }>().catch(() => null);

  if (!body?.providerId || !body.apiKey) {
    return c.json({ error: "providerId and apiKey are required" }, 400);
  }

  const definition = voiceRegistry.getDefinition(body.providerId);
  if (!definition) {
    return c.json({ error: `Unknown provider: ${body.providerId}` }, 400);
  }

  if (!definition.requiresApiKey) {
    return c.json({ error: `Provider ${body.providerId} does not require an API key` }, 400);
  }

  // Store in credentials.json using the provider's credentialKey
  configManager.setCredential(definition.credentialKey, body.apiKey);
  return c.json({ success: true });
});

/**
 * POST /api/voice/test-tts
 * Test TTS synthesis with sample text. Body: { providerId?, text?, voice?, speed? }
 * Returns audio buffer on success, error on failure.
 */
voiceRoutes.post("/test-tts", async (c) => {
  const body = await c.req.json<{
    providerId?: string;
    text?: string;
    voice?: string;
    speed?: number;
  }>().catch(() => null);

  const providerId = body?.ttsProvider ?? body?.providerId;
  const testText = body?.text ?? "你好，我是 Jarvis 语音助手，正在测试语音合成功能。";
  const voice = body?.voice;
  const speed = body?.speed;

  // Resolve provider
  const provider = providerId
    ? voiceRegistry.getTTS(providerId)
    : voiceRegistry.getDefaultTTS();

  if (!provider) {
    return c.json({ error: "No TTS provider available" }, 503);
  }

  if (!provider.isAvailable()) {
    return c.json({ error: `TTS provider "${provider.name}" is not available (API key missing)` }, 503);
  }

  try {
    const result = await provider.synthesize({ text: testText, voice, speed });
    return new Response(new Uint8Array(result.audio), {
      headers: {
        "Content-Type": "audio/wav",
        "X-TTS-Provider": result.provider,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: `TTS test failed: ${message}` }, 500);
  }
});

/**
 * POST /api/voice/test-asr
 * Test ASR transcription with a small audio sample. Accepts audio file upload.
 * Body: multipart form with "audio" file and optional "providerId".
 */
voiceRoutes.post("/test-asr", async (c) => {
  try {
    const formData = await c.req.formData();
    const audioFile = formData.get("audio");
    const providerId = formData.get("providerId") as string | null;

    if (!audioFile || !(audioFile instanceof File)) {
      return c.json({ error: "Missing audio file" }, 400);
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    const filename = audioFile.name || "audio.webm";

    // Resolve provider
    const provider = providerId
      ? voiceRegistry.getASR(providerId)
      : voiceRegistry.getDefaultASR();

    if (!provider) {
      return c.json({ error: "No ASR provider available" }, 503);
    }

    if (!provider.isAvailable()) {
      return c.json({ error: `ASR provider "${provider.name}" is not available (API key missing)` }, 503);
    }

    const result = await provider.transcribe({
      audio: audioBuffer,
      filename,
      language: formData.get("language") as string | undefined,
    });

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: `ASR test failed: ${message}` }, 500);
  }
});

export default voiceRoutes;
