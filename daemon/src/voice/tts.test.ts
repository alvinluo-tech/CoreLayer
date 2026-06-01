import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    MIMO_API_KEY: "test-key",
    MIMO_API_URL: "https://api.test.com/v1",
  },
}));

vi.mock("../config/config-manager.js", () => ({
  configManager: {
    getCredentials: vi.fn(() => ({})),
    getConfig: vi.fn(() => ({ providers: [] })),
    getProviderConfig: vi.fn(() => ({ baseURL: "", apiKey: "" })),
  },
}));

import { isTtsAvailable, synthesizeSpeech } from "./tts.js";
import { env } from "../config/env.js";

// Helper to build a minimal valid TTS JSON response
function ttsResponse(audioData: string) {
  return {
    choices: [{ message: { audio: { data: audioData } } }],
  };
}

describe("isTtsAvailable", () => {
  beforeEach(() => {
    vi.mocked(env).MIMO_API_KEY = "test-key";
  });

  it("returns true when MIMO_API_KEY is set", () => {
    expect(isTtsAvailable()).toBe(true);
  });

  it("returns false when MIMO_API_KEY is empty", () => {
    vi.mocked(env).MIMO_API_KEY = "";
    expect(isTtsAvailable()).toBe(false);
  });
});

describe("synthesizeSpeech", () => {
  let mockFetch: Mock;

  beforeEach(() => {
    vi.mocked(env).MIMO_API_KEY = "test-key";
    vi.mocked(env).MIMO_API_URL = "https://api.test.com/v1";

    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("throws when MIMO_API_KEY is missing", async () => {
    vi.mocked(env).MIMO_API_KEY = "";

    await expect(
      synthesizeSpeech({ text: "hello" }),
    ).rejects.toThrow("MIMO_API_KEY not configured");
  });

  it("returns a Buffer on successful response", async () => {
    const audioBase64 = Buffer.from("fake-audio-bytes").toString("base64");
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(ttsResponse(audioBase64)),
    });

    const result = await synthesizeSpeech({ text: "hello world" });

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString()).toBe("fake-audio-bytes");
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    await expect(
      synthesizeSpeech({ text: "hello" }),
    ).rejects.toThrow("MiMo TTS error (500): Internal Server Error");
  });

  it("throws when response has no audio data", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: {} }] }),
    });

    await expect(
      synthesizeSpeech({ text: "hello" }),
    ).rejects.toThrow("MiMo TTS: no audio data in response");
  });

  describe("markdown stripping", () => {
    beforeEach(() => {
      mockFetch.mockImplementation(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        // Return the cleaned text encoded in audio so we can inspect it
        const assistantMsg = body.messages[1].content;
        return {
          ok: true,
          json: () =>
            Promise.resolve(
              ttsResponse(Buffer.from(assistantMsg).toString("base64")),
            ),
        };
      });
    });

    it("strips bold markers", async () => {
      const result = await synthesizeSpeech({ text: "this is **bold** text" });
      expect(result.toString()).toBe("this is bold text");
    });

    it("strips heading markers", async () => {
      const result = await synthesizeSpeech({ text: "# Heading" });
      expect(result.toString()).toBe("Heading");
    });

    it("converts links to text only", async () => {
      const result = await synthesizeSpeech({
        text: "click [here](https://example.com) now",
      });
      expect(result.toString()).toBe("click here now");
    });

    it("strips thought tags", async () => {
      const result = await synthesizeSpeech({
        text: "before<thought>internal reasoning</thought>after",
      });
      expect(result.toString()).toBe("beforeafter");
    });

    it("converts newlines to commas", async () => {
      const result = await synthesizeSpeech({
        text: "line one\nline two\nline three",
      });
      expect(result.toString()).toBe("line one，line two，line three");
    });

    it("strips inline code backticks", async () => {
      const result = await synthesizeSpeech({
        text: "use `console.log` for debugging",
      });
      expect(result.toString()).toBe("use console.log for debugging");
    });
  });
});
