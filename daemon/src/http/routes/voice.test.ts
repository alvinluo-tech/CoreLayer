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
  },
}));

vi.mock("../../gateways/ai-provider/provider.js", () => ({
  getProviderConfig: vi.fn().mockReturnValue({ apiKey: "" }),
}));

vi.mock("../../config/config-manager.js", () => ({
  configManager: {
    getCredentials: vi.fn(() => ({})),
    getProviderConfig: vi.fn(() => ({ baseURL: "", apiKey: "" })),
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
});
