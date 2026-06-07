/**
 * Voice Runtime — manages voice sessions, transcription, and TTS.
 *
 * This runtime wraps the existing voice/ modules,
 * exposing them through the RuntimeProtocol HTTP endpoints.
 */

import type {
  ManagedRuntime,
  CreateManagedRuntimeInput,
} from "@jarvis/runtime-core";
import type {
  RuntimeInfo,
  RuntimeStatus,
  RuntimeCapabilitiesResponse,
  RuntimeEvent,
  StartRunRequest,
  StartRunResponse,
  CancelRunRequest,
  CancelRunResponse,
  ShutdownResponse,
  RuntimeHealth,
} from "@jarvis/runtime-protocol";
import { Hono } from "hono";
import { cors } from "hono/cors";

export interface VoiceRuntimeConfig extends CreateManagedRuntimeInput {
  /** Max concurrent voice sessions */
  maxConcurrentSessions?: number;
  /** ASR provider */
  asrProvider?: string;
  /** TTS provider */
  ttsProvider?: string;
}

interface ActiveVoiceSession {
  id: string;
  startedAt: string;
  abortController: AbortController;
}

/**
 * Voice Runtime implementation.
 */
export class VoiceRuntime implements ManagedRuntime {
  private info: RuntimeInfo;
  private health: RuntimeHealth = "unknown";
  private activeSessions = new Map<string, ActiveVoiceSession>();
  private completedSessions = 0;
  private failedSessions = 0;
  private startedAt: string | null = null;
  private eventListeners: Set<(event: RuntimeEvent) => void> = new Set();
  private maxConcurrentSessions: number;

  constructor(config: VoiceRuntimeConfig) {
    this.info = {
      id: config.id,
      kind: "voice",
      version: config.version,
      protocolVersion: 1,
      health: "unknown",
      port: config.port,
      appDataPath: config.appDataPath,
      logPath: config.logPath,
      restartCount: 0,
    };
    this.maxConcurrentSessions = config.maxConcurrentSessions ?? 1;
  }

  getInfo(): RuntimeInfo {
    return { ...this.info };
  }

  async getStatus(): Promise<RuntimeStatus> {
    const uptime = this.startedAt
      ? Date.now() - new Date(this.startedAt).getTime()
      : 0;

    const firstSession = this.activeSessions.values().next();
    const activeRunId = !firstSession.done
      ? firstSession.value.id
      : undefined;

    return {
      ...this.info,
      health: this.health,
      activeRun: this.activeSessions.size > 0,
      activeRunId,
      completedRuns: this.completedSessions,
      failedRuns: this.failedSessions,
      uptime,
    };
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

  async startRun(request: StartRunRequest): Promise<StartRunResponse> {
    if (this.activeSessions.size >= this.maxConcurrentSessions) {
      return {
        runId: request.runId,
        status: "rejected",
        reason: "Max concurrent voice sessions reached",
      };
    }

    const abortController = new AbortController();
    this.activeSessions.set(request.runId, {
      id: request.runId,
      startedAt: new Date().toISOString(),
      abortController,
    });

    this.emitEvent({
      type: "run:started",
      payload: {
        runtimeId: this.info.id,
        runId: request.runId,
        timestamp: new Date().toISOString(),
      },
    });

    return {
      runId: request.runId,
      status: "started",
    };
  }

  async cancelRun(request: CancelRunRequest): Promise<CancelRunResponse> {
    const session = this.activeSessions.get(request.runId);
    if (!session) {
      return { runId: request.runId, status: "not_found" };
    }

    session.abortController.abort();
    this.handleSessionFailed(
      request.runId,
      request.reason ?? "Cancelled by user",
    );

    return {
      runId: request.runId,
      status: "cancelled",
    };
  }

  async *subscribeToEvents(): AsyncIterable<RuntimeEvent> {
    const queue: RuntimeEvent[] = [];
    let resolve: (() => void) | null = null;

    const listener = (event: RuntimeEvent) => {
      queue.push(event);
      resolve?.();
    };

    this.eventListeners.add(listener);

    try {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          await new Promise<void>((r) => {
            resolve = r;
          });
        }
      }
    } finally {
      this.eventListeners.delete(listener);
    }
  }

  async shutdown(_response: ShutdownResponse): Promise<void> {
    for (const [sessionId, session] of this.activeSessions) {
      session.abortController.abort();
      this.handleSessionFailed(sessionId, "Runtime shutting down");
    }

    this.health = "unhealthy";
    this.info.health = "unhealthy";
  }

  async healthCheck(): Promise<boolean> {
    try {
      this.health = "healthy";
      this.info.health = "healthy";
      this.info.lastHealthCheck = new Date().toISOString();
      return true;
    } catch {
      this.health = "unhealthy";
      this.info.health = "unhealthy";
      return false;
    }
  }

  /**
   * Transcribe audio using the existing ASR module.
   */
  async transcribe(
    audioData: Buffer,
    options?: { language?: string; filename?: string },
  ): Promise<{ text: string; language?: string; duration?: number }> {
    const { transcribeWithGroq } = await import(
      "../../voice/asr.js"
    );

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
    const { synthesizeSpeech } = await import(
      "../../voice/tts.js"
    );

    const audioData = await synthesizeSpeech({
      text,
      voice: options?.voice,
      speed: options?.speed,
    });
    return {
      audioData,
      format: "pcm",
    };
  }

  /**
   * Mark a session as completed.
   */
  completeSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    this.activeSessions.delete(sessionId);
    this.completedSessions++;

    this.emitEvent({
      type: "run:completed",
      payload: {
        runtimeId: this.info.id,
        runId: sessionId,
        durationMs: Date.now() - new Date(session.startedAt).getTime(),
        timestamp: new Date().toISOString(),
      },
    });
  }

  private handleSessionFailed(sessionId: string, error: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    this.activeSessions.delete(sessionId);
    this.failedSessions++;

    this.emitEvent({
      type: "run:failed",
      payload: {
        runtimeId: this.info.id,
        runId: sessionId,
        error,
        durationMs: Date.now() - new Date(session.startedAt).getTime(),
        timestamp: new Date().toISOString(),
      },
    });
  }

  private emitEvent(event: RuntimeEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  /**
   * Create a Hono router with RuntimeProtocol endpoints.
   */
  createRouter(): Hono {
    const app = new Hono();
    app.use("/*", cors());

    // GET /health
    app.get("/health", async (c) => {
      const uptime = this.startedAt
        ? Date.now() - new Date(this.startedAt).getTime()
        : 0;
      return c.json({
        status: this.health === "healthy" ? "ok" : "error",
        timestamp: new Date().toISOString(),
        uptime,
      });
    });

    // GET /runtime/status
    app.get("/runtime/status", async (c) => {
      const status = await this.getStatus();
      return c.json(status);
    });

    // GET /runtime/capabilities
    app.get("/runtime/capabilities", async (c) => {
      const caps = this.getCapabilities();
      return c.json(caps);
    });

    // POST /runtime/start-run
    app.post("/runtime/start-run", async (c) => {
      const body = await c.req.json<StartRunRequest>();
      const result = await this.startRun(body);
      return c.json(result);
    });

    // POST /runtime/cancel-run
    app.post("/runtime/cancel-run", async (c) => {
      const body = await c.req.json<CancelRunRequest>();
      const result = await this.cancelRun(body);
      return c.json(result);
    });

    // POST /runtime/shutdown
    app.post("/runtime/shutdown", async (c) => {
      const body = await c.req.json<ShutdownResponse>();
      await this.shutdown(body);
      return c.json({
        status: "shutdown_initiated",
        timestamp: new Date().toISOString(),
      });
    });

    // POST /voice/transcribe
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

    // POST /voice/synthesize
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

  /**
   * Start the runtime.
   */
  async start(): Promise<void> {
    this.startedAt = new Date().toISOString();
    this.info.startedAt = this.startedAt;
    await this.healthCheck();

    this.emitEvent({
      type: "runtime:started",
      payload: {
        runtimeId: this.info.id,
        kind: "voice",
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * Create a new Voice Runtime.
 */
export function createVoiceRuntime(config: VoiceRuntimeConfig): VoiceRuntime {
  return new VoiceRuntime(config);
}
