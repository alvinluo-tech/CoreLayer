import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    MIMO_API_URL: "https://api.test.com/v1",
  },
}));

const mockCredentials: Record<string, string> = {};

vi.mock("../config/config-manager.js", () => ({
  configManager: {
    getCredentials: vi.fn(() => mockCredentials),
    getConfig: vi.fn(() => ({ providers: [] })),
    getProviderConfig: vi.fn(() => ({ baseURL: "https://api.test.com/v1", apiKey: "" })),
  },
}));

import { isTtsAvailable, synthesizeSpeech } from "./tts.js";

// Helper to build a minimal valid TTS JSON response
function ttsResponse(audioData: string) {
  return {
    choices: [{ message: { audio: { data: audioData } } }],
  };
}

describe("isTtsAvailable", () => {
  beforeEach(() => {
    mockCredentials["mimo"] = "test-key";
  });

  it("returns true when mimo key is set", () => {
    expect(isTtsAvailable()).toBe(true);
  });

  it("returns false when mimo key is empty", () => {
    mockCredentials["mimo"] = "";
    expect(isTtsAvailable()).toBe(false);
  });

  it("returns false when no credentials exist", () => {
    delete mockCredentials["mimo"];
    expect(isTtsAvailable()).toBe(false);
  });
});

describe("synthesizeSpeech", () => {
  let mockFetch: Mock;

  beforeEach(() => {
    mockCredentials["mimo"] = "test-key";

    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("throws when mimo key is missing", async () => {
    mockCredentials["mimo"] = "";

    await expect(
      synthesizeSpeech({ text: "hello" }),
    ).rejects.toThrow("MIMO_API_KEY not configured");
  });

  it("calls MiMo TTS API with correct parameters", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(ttsResponse("audio-data")),
    });

    await synthesizeSpeech({ text: "Hello world" });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.test.com/v1/chat/completions");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body.model).toBe("mimo-v2.5-tts");
    expect(body.messages).toHaveLength(2);
  });

  it("returns audio buffer on success", async () => {
    const audioData = Buffer.from("fake-audio").toString("base64");
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(ttsResponse(audioData)),
    });

    const result = await synthesizeSpeech({ text: "test" });
    expect(result).toBeInstanceOf(Buffer);
  });

  it("strips markdown from text before sending", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(ttsResponse("dGVzdA==")),
    });

    await synthesizeSpeech({ text: "**bold** and *italic*" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const assistantMsg = body.messages[1].content;
    expect(assistantMsg).not.toContain("**");
    expect(assistantMsg).not.toContain("*");
  });
});
