import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock all external dependencies via direct imports
const mockTranscribeWithGroq = vi.fn();
const mockIsAsrAvailable = vi.fn().mockReturnValue(false);
const mockSynthesizeSpeech = vi.fn();
const mockIsTtsAvailable = vi.fn().mockReturnValue(false);
const mockRunStreamTurn = vi.fn();

vi.mock("../../runtimes/voice/asr.js", () => ({
  transcribeWithGroq: (...args: unknown[]) => mockTranscribeWithGroq(...args),
  isAsrAvailable: () => mockIsAsrAvailable(),
}));

vi.mock("../../runtimes/voice/tts.js", () => ({
  synthesizeSpeech: (...args: unknown[]) => mockSynthesizeSpeech(...args),
  isTtsAvailable: () => mockIsTtsAvailable(),
}));

vi.mock("../../runtimes/voice/streaming-tts.js", () => ({
  StreamingTTS: vi.fn().mockImplementation(() => ({
    feed: vi.fn(),
    flush: vi.fn().mockResolvedValue([]),
    onAudio: vi.fn(),
  })),
}));

vi.mock("../../runtimes/voice/providers.js", () => ({
  voiceRegistry: {
    getAvailableASR: vi.fn().mockReturnValue([]),
    getAvailableTTS: vi.fn().mockReturnValue([]),
    getDefinitions: vi.fn().mockReturnValue([]),
    getDefinitionsByKind: vi.fn().mockReturnValue([]),
    getDefinition: vi.fn().mockReturnValue(undefined),
    getASR: vi.fn().mockReturnValue(undefined),
    getTTS: vi.fn().mockReturnValue(undefined),
    getDefaultASR: vi.fn().mockReturnValue(null),
    getDefaultTTS: vi.fn().mockReturnValue(null),
  },
}));

vi.mock("../../gateways/ai-provider/provider.js", () => ({
  getProviderConfig: vi.fn().mockReturnValue({ apiKey: "" }),
}));

vi.mock("../../config/config-manager.js", () => ({
  configManager: {
    getCredentials: vi.fn(() => ({})),
    getProviderConfig: vi.fn(() => ({ baseURL: "", apiKey: "" })),
    getVoiceConfig: vi.fn(() => ({
      asrProvider: "",
      asrModel: "",
      ttsProvider: "",
      ttsModel: "mimo-v2.5-tts",
      ttsVoice: "茉莉",
      ttsSpeed: 1.0,
    })),
    updateVoiceConfig: vi.fn(),
    setCredential: vi.fn(),
  },
}));

vi.mock("../../shared/errors.js", () => ({
  extractErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
  logError: vi.fn(),
}));

vi.mock("../../runtimes/agent/stream.js", () => ({
  runStreamTurn: (...args: unknown[]) => mockRunStreamTurn(...args),
}));

// Mock DB layer (needed by some transitive imports)
vi.mock("../../persistence/client.js", () => ({ db: {}, schema: {} }));

const voiceRoutes = (await import("./voice.js")).default;

function createTestApp() {
  const { Hono } = require("hono");
  const app = new Hono();
  app.route("/api/voice", voiceRoutes);
  return app;
}

describe("voice routes", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  describe("GET /api/voice/status", () => {
    it("returns voice pipeline status", async () => {
      const res = await app.request("/api/voice/status");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("asr");
      expect(body).toHaveProperty("tts");
      expect(body).toHaveProperty("wakeWord");
    });
  });

  describe("POST /api/voice/converse-stream", () => {
    it("returns 400 for empty message", async () => {
      const res = await app.request("/api/voice/converse-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing message", async () => {
      const res = await app.request("/api/voice/converse-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("calls runStreamTurn with mode=voice", async () => {
      mockRunStreamTurn.mockResolvedValue({
        runId: "run-1",
        conversationId: "conv-1",
        stream: {
          [Symbol.asyncIterator]() {
            let done = false;
            return {
              async next() {
                if (!done) {
                  done = true;
                  return { value: { type: "run_completed", result: { text: "hi", conversationId: "conv-1" } }, done: false };
                }
                return { value: undefined, done: true };
              },
            };
          },
        },
        abortController: new AbortController(),
      });

      const res = await app.request("/api/voice/converse-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      });

      expect(res.status).toBe(200);
      expect(mockRunStreamTurn).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "voice", input: "hello" }),
        expect.objectContaining({ abortController: expect.any(AbortController) }),
      );
    });

    it("returns 500 when runStreamTurn throws", async () => {
      mockRunStreamTurn.mockRejectedValue(new Error("init failed"));

      const res = await app.request("/api/voice/converse-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("init failed");
    });
  });

  describe("POST /api/voice/converse-voice-stream", () => {
    it("returns 400 for empty message", async () => {
      const res = await app.request("/api/voice/converse-voice-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "  " }),
      });
      expect(res.status).toBe(400);
    });

    it("calls runStreamTurn with mode=voice", async () => {
      mockRunStreamTurn.mockResolvedValue({
        runId: "run-2",
        conversationId: "conv-2",
        stream: {
          [Symbol.asyncIterator]() {
            let done = false;
            return {
              async next() {
                if (!done) {
                  done = true;
                  return { value: { type: "run_completed", result: { text: "hello", conversationId: "conv-2" } }, done: false };
                }
                return { value: undefined, done: true };
              },
            };
          },
        },
        abortController: new AbortController(),
      });

      const res = await app.request("/api/voice/converse-voice-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      });

      expect(res.status).toBe(200);
      expect(mockRunStreamTurn).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "voice", input: "hello" }),
        expect.objectContaining({ abortController: expect.any(AbortController) }),
      );
    });

    it("returns 500 when runStreamTurn throws", async () => {
      mockRunStreamTurn.mockRejectedValue(new Error("voice init error"));

      const res = await app.request("/api/voice/converse-voice-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      });

      expect(res.status).toBe(500);
    });
  });

  describe("POST /api/voice/transcribe", () => {
    it("returns 503 when ASR not configured", async () => {
      const res = await app.request("/api/voice/transcribe", {
        method: "POST",
        body: new FormData(),
      });
      expect(res.status).toBe(503);
    });
  });

  describe("POST /api/voice/synthesize", () => {
    it("returns 503 when TTS not configured", async () => {
      const res = await app.request("/api/voice/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "hello" }),
      });
      expect(res.status).toBe(503);
    });
  });

  describe("GET /api/voice/providers", () => {
    it("returns provider definitions", async () => {
      const { voiceRegistry } = await import("../../runtimes/voice/providers.js");
      vi.mocked(voiceRegistry.getDefinitions).mockReturnValue([
        {
          id: "groq",
          name: "Groq Whisper",
          kind: "asr",
          models: [{ id: "whisper-large-v3-turbo", name: "Whisper V3 Turbo" }],
          requiresApiKey: true,
          credentialKey: "groq",
        },
      ]);

      const res = await app.request("/api/voice/providers");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.providers).toHaveLength(1);
      expect(body.providers[0].id).toBe("groq");
    });
  });

  describe("GET /api/voice/config", () => {
    it("returns voice configuration", async () => {
      const res = await app.request("/api/voice/config");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("ttsModel");
      expect(body).toHaveProperty("ttsVoice");
      expect(body).toHaveProperty("ttsSpeed");
    });
  });

  describe("PUT /api/voice/config", () => {
    it("saves voice configuration", async () => {
      const { configManager } = await import("../../config/config-manager.js");
      const res = await app.request("/api/voice/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttsProvider: "mimo", ttsSpeed: 1.2 }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(configManager.updateVoiceConfig).toHaveBeenCalledWith({ ttsProvider: "mimo", ttsSpeed: 1.2 });
    });

    it("returns 400 for invalid body", async () => {
      const res = await app.request("/api/voice/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("PUT /api/voice/credentials", () => {
    it("saves API key for known provider", async () => {
      const { voiceRegistry } = await import("../../runtimes/voice/providers.js");
      const { configManager } = await import("../../config/config-manager.js");
      vi.mocked(voiceRegistry.getDefinition).mockReturnValue({
        id: "groq",
        name: "Groq Whisper",
        kind: "asr",
        models: [],
        requiresApiKey: true,
        credentialKey: "groq",
      });

      const res = await app.request("/api/voice/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: "groq", apiKey: "sk-test" }),
      });
      expect(res.status).toBe(200);
      expect(configManager.setCredential).toHaveBeenCalledWith("groq", "sk-test");
    });

    it("returns 400 for unknown provider", async () => {
      const { voiceRegistry } = await import("../../runtimes/voice/providers.js");
      vi.mocked(voiceRegistry.getDefinition).mockReturnValue(undefined);

      const res = await app.request("/api/voice/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: "unknown", apiKey: "key" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing fields", async () => {
      const res = await app.request("/api/voice/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: "groq" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/voice/test-tts", () => {
    it("returns 503 when no TTS provider available", async () => {
      const { voiceRegistry } = await import("../../runtimes/voice/providers.js");
      vi.mocked(voiceRegistry.getDefaultTTS).mockReturnValue(null);
      vi.mocked(voiceRegistry.getTTS).mockReturnValue(undefined);

      const res = await app.request("/api/voice/test-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "hello" }),
      });
      expect(res.status).toBe(503);
    });
  });

  describe("POST /api/voice/test-asr", () => {
    it("returns 400 for missing audio file", async () => {
      const res = await app.request("/api/voice/test-asr", {
        method: "POST",
        body: new FormData(),
      });
      expect(res.status).toBe(400);
    });
  });
});
