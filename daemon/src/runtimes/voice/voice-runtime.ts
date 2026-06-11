/**
 * Voice Runtime — manages voice sessions, transcription, and TTS.
 *
 * This runtime wraps the existing voice modules,
 * exposing them through the RuntimeProtocol HTTP endpoints.
 */

import type {
  RuntimeCapabilitiesResponse,
  StartRunRequest,
  StartRunResponse,
} from "@jarvis/runtime-protocol";
import { BaseRuntime, BaseRuntimeConfig } from "../base-runtime.js";

export interface VoiceRuntimeConfig extends BaseRuntimeConfig {
  /** Max concurrent voice sessions */
  maxConcurrentSessions?: number;
  /** ASR provider */
  asrProvider?: string;
  /** TTS provider */
  ttsProvider?: string;
}

/**
 * Voice Runtime implementation.
 */
export class VoiceRuntime extends BaseRuntime {
  private maxConcurrentSessions: number;

  constructor(config: VoiceRuntimeConfig) {
    super({ ...config, kind: "voice" });
    this.maxConcurrentSessions = config.maxConcurrentSessions ?? 1;
  }

  getCapabilities(): RuntimeCapabilitiesResponse {
    return {
      capabilities: [
        "voice:transcribe",
        "voice:synthesize",
        "voice:session_start",
        "voice:session_stop",
      ],
      supportedEvents: [
        "run:started",
        "run:completed",
        "run:failed",
        "voice:transcription",
        "voice:synthesis",
      ],
      maxConcurrentRuns: this.maxConcurrentSessions,
    };
  }

  override async startRun(request: StartRunRequest): Promise<StartRunResponse> {
    if (this.activeRuns.size >= this.maxConcurrentSessions) {
      return {
        runId: request.runId,
        status: "rejected",
        reason: "Max concurrent voice sessions reached",
      };
    }
    return super.startRun(request);
  }

  /**
   * Transcribe audio using the existing ASR module.
   */
  async transcribe(
    audioData: Buffer,
    options?: { language?: string; filename?: string },
  ): Promise<{ text: string; language?: string; duration?: number }> {
    const { transcribeWithGroq } = await import("./asr.js");
    const result = await transcribeWithGroq(
      audioData,
      options?.filename ?? "audio.webm",
      options?.language,
    );
    return {
      text: result.text,
      language: result.language,
      duration: result.duration,
    };
  }

  /**
   * Synthesize text to speech using the existing TTS module.
   */
  async synthesize(
    text: string,
    options?: { voice?: string; speed?: number },
  ): Promise<{ audioData: Buffer; format: string }> {
    const { synthesizeSpeech } = await import("./tts.js");
    const audioData = await synthesizeSpeech({
      text,
      voice: options?.voice,
      speed: options?.speed,
    });
    return { audioData, format: "pcm" };
  }

  /** Alias for base completeRun — used by voice-specific callers */
  completeSession(sessionId: string): void {
    this.completeRun(sessionId);
  }

  override createRouter() {
    const app = super.createRouter();

    app.post("/voice/transcribe", async (c) => {
      const body = await c.req.json<{
        audioData: string;
        language?: string;
        filename?: string;
      }>();
      const audioBuffer = Buffer.from(body.audioData, "base64");
      const result = await this.transcribe(audioBuffer, {
        language: body.language,
        filename: body.filename,
      });
      return c.json(result);
    });

    app.post("/voice/synthesize", async (c) => {
      const body = await c.req.json<{
        text: string;
        voice?: string;
        speed?: number;
      }>();
      const result = await this.synthesize(body.text, {
        voice: body.voice,
        speed: body.speed,
      });
      return c.json({
        audioData: result.audioData.toString("base64"),
        format: result.format,
      });
    });

    return app;
  }
}

/**
 * Create a new Voice Runtime.
 */
export function createVoiceRuntime(config: VoiceRuntimeConfig): VoiceRuntime {
  return new VoiceRuntime(config);
}
