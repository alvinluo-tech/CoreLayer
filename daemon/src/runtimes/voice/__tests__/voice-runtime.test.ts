import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("hono", () => {
  class MockHono {
    private routes: Array<{
      method: string;
      path: string;
      handler: (c: Record<string, unknown>) => Promise<unknown>;
    }> = [];

    use(_path: string, _middleware: unknown) {
      return this;
    }

    get(path: string, handler: (c: Record<string, unknown>) => Promise<unknown>) {
      this.routes.push({ method: "GET", path, handler });
      return this;
    }

    post(path: string, handler: (c: Record<string, unknown>) => Promise<unknown>) {
      this.routes.push({ method: "POST", path, handler });
      return this;
    }

    async request(path: string, init?: { method?: string; body?: any }) {
      const method = init?.method ?? "GET";
      const route = this.routes.find(
        (r) => r.path === path && r.method === method,
      );
      if (!route) {
        return new Response("Not Found", { status: 404 });
      }

      let bodyData: unknown = undefined;
      if (init?.body !== undefined) {
        bodyData = init.body;
      }

      const c = {
        req: {
          json: async <T = unknown>(): Promise<T> => bodyData as T,
        },
        json: (data: unknown, status?: number) =>
          new Response(JSON.stringify(data), {
            status: status ?? 200,
            headers: { "Content-Type": "application/json" },
          }),
      };

      return route.handler(c) as Promise<Response>;
    }
  }
  return { Hono: MockHono };
});

vi.mock("hono/cors", () => ({
  cors: () => (_c: unknown, next: () => Promise<void>) => next(),
}));

const mockTranscribeWithGroq = vi.fn();
vi.mock("../asr.js", () => ({
  transcribeWithGroq: (...args: unknown[]) => mockTranscribeWithGroq(...args),
}));

const mockSynthesizeSpeech = vi.fn();
vi.mock("../tts.js", () => ({
  synthesizeSpeech: (...args: unknown[]) => mockSynthesizeSpeech(...args),
}));

const {
  VoiceRuntime,
  createVoiceRuntime,
} = await import("../voice-runtime.js");

const baseConfig = {
  id: "test-voice",
  kind: "voice" as const,
  version: "1.0.0",
  appDataPath: "/tmp/test-data",
  logPath: "/tmp/test-logs",
};

describe("VoiceRuntime", () => {
  let runtime: InstanceType<typeof VoiceRuntime>;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = new VoiceRuntime(baseConfig);
  });

  describe("class interface", () => {
    it("creates via factory function", () => {
      const instance = createVoiceRuntime(baseConfig);
      expect(instance).toBeInstanceOf(VoiceRuntime);
    });

    it("has all ManagedRuntime methods", () => {
      expect(typeof runtime.start).toBe("function");
      expect(typeof runtime.shutdown).toBe("function");
      expect(typeof runtime.getStatus).toBe("function");
      expect(typeof runtime.getInfo).toBe("function");
      expect(typeof runtime.getCapabilities).toBe("function");
      expect(typeof runtime.startRun).toBe("function");
      expect(typeof runtime.cancelRun).toBe("function");
      expect(typeof runtime.healthCheck).toBe("function");
      expect(typeof runtime.createRouter).toBe("function");
      expect(typeof runtime.completeSession).toBe("function");
      expect(typeof runtime.transcribe).toBe("function");
      expect(typeof runtime.synthesize).toBe("function");
    });
  });

  describe("getInfo", () => {
    it("returns voice info", () => {
      const info = runtime.getInfo();
      expect(info.id).toBe("test-voice");
      expect(info.kind).toBe("voice");
      expect(info.version).toBe("1.0.0");
      expect(info.protocolVersion).toBe(1);
    });
  });

  describe("getCapabilities", () => {
    it("returns voice-specific capabilities", () => {
      const caps = runtime.getCapabilities();
      expect(caps.capabilities).toContain("voice:transcribe");
      expect(caps.capabilities).toContain("voice:synthesize");
      expect(caps.capabilities).toContain("voice:session_start");
      expect(caps.capabilities).toContain("voice:session_stop");
      expect(caps.supportedEvents).toContain("voice:transcription");
      expect(caps.supportedEvents).toContain("voice:synthesis");
      expect(caps.maxConcurrentRuns).toBe(1);
    });

    it("respects custom maxConcurrentSessions", () => {
      const custom = new VoiceRuntime({
        ...baseConfig,
        maxConcurrentSessions: 3,
      });
      const caps = custom.getCapabilities();
      expect(caps.maxConcurrentRuns).toBe(3);
    });
  });

  describe("getStatus", () => {
    it("returns zero uptime before start", async () => {
      const status = await runtime.getStatus();
      expect(status.uptime).toBe(0);
      expect(status.activeRun).toBe(false);
    });
  });

  describe("startRun", () => {
    it("starts a voice session", async () => {
      const result = await runtime.startRun({
        runId: "session-1",
        input: {},
      });
      expect(result.status).toBe("started");
      expect(result.runId).toBe("session-1");
    });

    it("rejects when max concurrent sessions reached", async () => {
      await runtime.startRun({ runId: "session-1", input: {} });
      const result = await runtime.startRun({ runId: "session-2", input: {} });
      expect(result.status).toBe("rejected");
      expect(result.reason).toBe("Max concurrent voice sessions reached");
    });
  });

  describe("cancelRun", () => {
    it("cancels an active session", async () => {
      await runtime.startRun({ runId: "session-1", input: {} });
      const result = await runtime.cancelRun({ runId: "session-1" });
      expect(result.status).toBe("cancelled");
    });

    it("returns not_found for unknown session", async () => {
      const result = await runtime.cancelRun({ runId: "unknown" });
      expect(result.status).toBe("not_found");
    });
  });

  describe("completeSession", () => {
    it("increments completedSessions counter", async () => {
      await runtime.startRun({ runId: "session-1", input: {} });
      runtime.completeSession("session-1");

      const status = await runtime.getStatus();
      expect(status.completedRuns).toBe(1);
      expect(status.activeRun).toBe(false);
    });

    it("ignores unknown session IDs", () => {
      runtime.completeSession("nonexistent");
    });
  });

  describe("transcribe", () => {
    it("delegates to ASR module", async () => {
      mockTranscribeWithGroq.mockResolvedValue({
        text: "Hello world",
        language: "en",
        duration: 2.5,
      });

      const result = await runtime.transcribe(Buffer.from("audio"), {
        language: "en",
        filename: "test.webm",
      });
      expect(result.text).toBe("Hello world");
      expect(result.language).toBe("en");
      expect(result.duration).toBe(2.5);
      expect(mockTranscribeWithGroq).toHaveBeenCalledWith(
        Buffer.from("audio"),
        "test.webm",
        "en",
      );
    });

    it("uses default filename when not provided", async () => {
      mockTranscribeWithGroq.mockResolvedValue({ text: "Hi" });

      await runtime.transcribe(Buffer.from("audio"));
      expect(mockTranscribeWithGroq).toHaveBeenCalledWith(
        Buffer.from("audio"),
        "audio.webm",
        undefined,
      );
    });
  });

  describe("synthesize", () => {
    it("delegates to TTS module", async () => {
      mockSynthesizeSpeech.mockResolvedValue(Buffer.from("audio-pcm"));

      const result = await runtime.synthesize("Hello world", {
        voice: "alloy",
        speed: 1.5,
      });
      expect(result.audioData).toEqual(Buffer.from("audio-pcm"));
      expect(result.format).toBe("pcm");
      expect(mockSynthesizeSpeech).toHaveBeenCalledWith({
        text: "Hello world",
        voice: "alloy",
        speed: 1.5,
      });
    });
  });

  describe("shutdown", () => {
    it("cancels all active sessions and sets unhealthy", async () => {
      await runtime.startRun({ runId: "session-1", input: {} });
      await runtime.shutdown({
        status: "shutdown_initiated",
        timestamp: new Date().toISOString(),
      });

      const status = await runtime.getStatus();
      expect(status.health).toBe("unhealthy");
      expect(status.failedRuns).toBe(1);
    });
  });

  describe("healthCheck", () => {
    it("sets health to healthy", async () => {
      const result = await runtime.healthCheck();
      expect(result).toBe(true);
      const status = await runtime.getStatus();
      expect(status.health).toBe("healthy");
    });
  });

  describe("start", () => {
    it("initializes the runtime", async () => {
      await runtime.start();
      const status = await runtime.getStatus();
      expect(status.health).toBe("healthy");
    });
  });

  describe("Hono router", () => {
    it("GET /health returns ok when started", async () => {
      const router = runtime.createRouter();
      await runtime.start();

      const res = await router.request("/health", { method: "GET" });
      const body = await res.json();
      expect(body.status).toBe("ok");
    });

    it("GET /runtime/status returns status", async () => {
      const router = runtime.createRouter();

      const res = await router.request("/runtime/status", { method: "GET" });
      const body = await res.json();
      expect(body.kind).toBe("voice");
    });

    it("GET /runtime/capabilities returns capabilities", async () => {
      const router = runtime.createRouter();

      const res = await router.request("/runtime/capabilities", {
        method: "GET",
      });
      const body = await res.json();
      expect(body.capabilities).toContain("voice:transcribe");
    });

    it("POST /runtime/start-run starts a session", async () => {
      const router = runtime.createRouter();

      const res = await router.request("/runtime/start-run", {
        method: "POST",
        body: { runId: "session-1", input: {} } as any,
      });
      const body = await res.json();
      expect(body.status).toBe("started");
    });

    it("POST /voice/transcribe transcribes audio", async () => {
      mockTranscribeWithGroq.mockResolvedValue({
        text: "Hello",
        language: "en",
      });
      const router = runtime.createRouter();

      const res = await router.request("/voice/transcribe", {
        method: "POST",
        body: {
          audioData: Buffer.from("audio").toString("base64"),
          language: "en",
        } as any,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.text).toBe("Hello");
    });

    it("POST /voice/synthesize synthesizes text", async () => {
      mockSynthesizeSpeech.mockResolvedValue(Buffer.from("pcm-data"));
      const router = runtime.createRouter();

      const res = await router.request("/voice/synthesize", {
        method: "POST",
        body: { text: "Hello world" } as any,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.format).toBe("pcm");
    });

    it("POST /runtime/shutdown initiates shutdown", async () => {
      const router = runtime.createRouter();

      const res = await router.request("/runtime/shutdown", {
        method: "POST",
        body: { status: "shutdown_initiated", timestamp: new Date().toISOString() } as any,
      });
      const body = await res.json();
      expect(body.status).toBe("shutdown_initiated");
    });
  });
});
