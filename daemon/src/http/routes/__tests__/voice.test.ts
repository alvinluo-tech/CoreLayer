import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock all external dependencies via direct imports
const mockTranscribeWithGroq = vi.fn();
const mockIsAsrAvailable = vi.fn().mockReturnValue(false);
const mockSynthesizeSpeech = vi.fn();
const mockIsTtsAvailable = vi.fn().mockReturnValue(false);
const mockRunStreamTurn = vi.fn();

vi.mock("../../../runtimes/voice/asr.js", () => ({
  transcribeWithGroq: (...args: unknown[]) => mockTranscribeWithGroq(...args),
  isAsrAvailable: () => mockIsAsrAvailable(),
}));

vi.mock("../../../runtimes/voice/tts.js", () => ({
  synthesizeSpeech: (...args: unknown[]) => mockSynthesizeSpeech(...args),
  isTtsAvailable: () => mockIsTtsAvailable(),
}));

vi.mock("../../../runtimes/voice/streaming-tts.js", () => ({
  StreamingTTS: vi.fn().mockImplementation(() => ({
    feed: vi.fn(),
    flush: vi.fn().mockResolvedValue([]),
    onAudio: vi.fn(),
  })),
}));

vi.mock("../../../runtimes/voice/providers.js", () => ({
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

vi.mock("../../../gateways/ai-provider/provider.js", () => ({
  getProviderConfig: vi.fn().mockReturnValue({ apiKey: "" }),
}));

vi.mock("../../../config/config-manager.js", () => ({
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

vi.mock("../../../shared/errors.js", () => ({
  extractErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
  logError: vi.fn(),
}));

vi.mock("../../../runtimes/agent/stream.js", () => ({
  runStreamTurn: (...args: unknown[]) => mockRunStreamTurn(...args),
}));

// Mock DB layer (needed by some transitive imports)
vi.mock("../../../persistence/client.js", () => ({ db: {}, schema: {} }));

const voiceRoutes = (await import("../voice.js")).default;

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
      const { voiceRegistry } = await import("../../../runtimes/voice/providers.js");
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

    it("includes availability status for each provider", async () => {
      const { voiceRegistry } = await import("../../../runtimes/voice/providers.js");
      const mockTts = { name: "mimo", isAvailable: vi.fn().mockReturnValue(true) };
      vi.mocked(voiceRegistry.getDefinitions).mockReturnValue([
        {
          id: "mimo",
          name: "MiMo TTS",
          kind: "tts",
          models: [{ id: "mimo-v2.5-tts", name: "MiMo TTS" }],
          requiresApiKey: true,
          credentialKey: "mimo",
          voices: [{ id: "茉莉", name: "茉莉" }],
        },
        {
          id: "groq",
          name: "Groq Whisper",
          kind: "asr",
          models: [{ id: "whisper-large-v3-turbo", name: "Whisper V3 Turbo" }],
          requiresApiKey: true,
          credentialKey: "groq",
        },
      ]);
      vi.mocked(voiceRegistry.getTTS).mockReturnValue(mockTts as never);
      vi.mocked(voiceRegistry.getASR).mockReturnValue(undefined);
      vi.mocked(voiceRegistry.getAvailableTTS).mockReturnValue([mockTts] as never);
      vi.mocked(voiceRegistry.getAvailableASR).mockReturnValue([]);

      const res = await app.request("/api/voice/providers");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.providers).toHaveLength(2);
      // mimo should be available (mocked TTS is available)
      expect(body.providers[0].available).toBe(true);
      // groq should not be available (no ASR mock registered)
      expect(body.providers[1].available).toBe(false);
    });

    it("includes hasApiKey and metadata fields", async () => {
      const { voiceRegistry } = await import("../../../runtimes/voice/providers.js");
      const { configManager } = await import("../../../config/config-manager.js");
      vi.mocked(configManager.getCredentials).mockReturnValue({ groq: "sk-123" });
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
      const body = await res.json();
      const provider = body.providers[0];
      expect(provider).toHaveProperty("id", "groq");
      expect(provider).toHaveProperty("name", "Groq Whisper");
      expect(provider).toHaveProperty("kind", "asr");
      expect(provider).toHaveProperty("requiresApiKey", true);
      expect(provider).toHaveProperty("hasApiKey", true);
      expect(provider).toHaveProperty("models");
      expect(Array.isArray(provider.models)).toBe(true);
    });

    it("returns empty providers list when none registered", async () => {
      const { voiceRegistry } = await import("../../../runtimes/voice/providers.js");
      vi.mocked(voiceRegistry.getDefinitions).mockReturnValue([]);

      const res = await app.request("/api/voice/providers");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.providers).toEqual([]);
    });
  });

  describe("GET /api/voice/config", () => {
    it("returns voice configuration with all fields", async () => {
      const res = await app.request("/api/voice/config");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("asrProvider");
      expect(body).toHaveProperty("asrModel");
      expect(body).toHaveProperty("ttsProvider");
      expect(body).toHaveProperty("ttsModel");
      expect(body).toHaveProperty("ttsVoice");
      expect(body).toHaveProperty("ttsSpeed");
    });

    it("returns default values when config has empty fields", async () => {
      const { configManager } = await import("../../../config/config-manager.js");
      vi.mocked(configManager.getVoiceConfig).mockReturnValue({
        asrProvider: "",
        asrModel: "",
        ttsProvider: "",
        ttsModel: "mimo-v2.5-tts",
        ttsVoice: "茉莉",
        ttsSpeed: 1.0,
      });

      const res = await app.request("/api/voice/config");
      const body = await res.json();
      expect(body.asrProvider).toBe("");
      expect(body.ttsModel).toBe("mimo-v2.5-tts");
      expect(body.ttsVoice).toBe("茉莉");
      expect(body.ttsSpeed).toBe(1.0);
    });
  });

  describe("PUT /api/voice/config", () => {
    it("saves voice configuration", async () => {
      const { configManager } = await import("../../../config/config-manager.js");
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

    it("accepts partial config updates", async () => {
      const { configManager } = await import("../../../config/config-manager.js");
      const res = await app.request("/api/voice/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttsVoice: "alloy" }),
      });
      expect(res.status).toBe(200);
      expect(configManager.updateVoiceConfig).toHaveBeenCalledWith({ ttsVoice: "alloy" });
    });

    it("returns updated config in response", async () => {
      const { configManager } = await import("../../../config/config-manager.js");
      vi.mocked(configManager.getVoiceConfig).mockReturnValue({
        asrProvider: "",
        asrModel: "",
        ttsProvider: "mimo",
        ttsModel: "mimo-v2.5-tts",
        ttsVoice: "alloy",
        ttsSpeed: 1.2,
      });

      const res = await app.request("/api/voice/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttsVoice: "alloy", ttsSpeed: 1.2 }),
      });
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.config.ttsVoice).toBe("alloy");
      expect(body.config.ttsSpeed).toBe(1.2);
    });
  });

  describe("PUT /api/voice/credentials", () => {
    it("saves API key for known provider", async () => {
      const { voiceRegistry } = await import("../../../runtimes/voice/providers.js");
      const { configManager } = await import("../../../config/config-manager.js");
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
      const { voiceRegistry } = await import("../../../runtimes/voice/providers.js");
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
      const { voiceRegistry } = await import("../../../runtimes/voice/providers.js");
      vi.mocked(voiceRegistry.getDefaultTTS).mockReturnValue(null);
      vi.mocked(voiceRegistry.getTTS).mockReturnValue(undefined);

      const res = await app.request("/api/voice/test-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "hello" }),
      });
      expect(res.status).toBe(503);
    });

    it("returns 503 when specific provider is not available", async () => {
      const { voiceRegistry } = await import("../../../runtimes/voice/providers.js");
      vi.mocked(voiceRegistry.getTTS).mockReturnValue({
        name: "mimo",
        isAvailable: vi.fn().mockReturnValue(false),
        synthesize: vi.fn(),
      } as never);

      const res = await app.request("/api/voice/test-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: "mimo", text: "hello" }),
      });
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toContain("not available");
    });

    it("uses default text when no text provided", async () => {
      const { voiceRegistry } = await import("../../../runtimes/voice/providers.js");
      const mockSynthesize = vi.fn().mockResolvedValue({
        audio: Buffer.from("fake-audio"),
        provider: "mimo",
      });
      vi.mocked(voiceRegistry.getDefaultTTS).mockReturnValue({
        name: "mimo",
        isAvailable: vi.fn().mockReturnValue(true),
        synthesize: mockSynthesize,
      } as never);

      const res = await app.request("/api/voice/test-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      // Default text is the Chinese test string from the source
      expect(mockSynthesize).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Jarvis"),
        })
      );
    });

    it("returns audio with X-TTS-Provider header on success", async () => {
      const { voiceRegistry } = await import("../../../runtimes/voice/providers.js");
      vi.mocked(voiceRegistry.getDefaultTTS).mockReturnValue({
        name: "mimo",
        isAvailable: vi.fn().mockReturnValue(true),
        synthesize: vi.fn().mockResolvedValue({
          audio: Buffer.from("audio-data"),
          provider: "mimo",
        }),
      } as never);

      const res = await app.request("/api/voice/test-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "test" }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("audio/wav");
      expect(res.headers.get("x-tts-provider")).toBe("mimo");
    });

    it("returns 500 when synthesis throws", async () => {
      const { voiceRegistry } = await import("../../../runtimes/voice/providers.js");
      vi.mocked(voiceRegistry.getDefaultTTS).mockReturnValue({
        name: "mimo",
        isAvailable: vi.fn().mockReturnValue(true),
        synthesize: vi.fn().mockRejectedValue(new Error("API rate limit")),
      } as never);

      const res = await app.request("/api/voice/test-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "test" }),
      });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("TTS test failed");
      expect(body.error).toContain("API rate limit");
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
