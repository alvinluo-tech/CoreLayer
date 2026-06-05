import { describe, it, expect } from "vitest";

describe("ProviderRegistry", () => {
  it("should have registered Groq ASR provider", async () => {
    const { voiceRegistry } = await import("./providers.js");
    await import("./asr.js");

    const all = voiceRegistry.getAvailableASR();
    if (process.env.GROQ_API_KEY) {
      expect(all.some((p) => p.name === "groq")).toBe(true);
    }
  });

  it("should have registered MiMo TTS provider", async () => {
    const { voiceRegistry } = await import("./providers.js");
    await import("./tts.js");

    if (process.env.MIMO_API_KEY) {
      const all = voiceRegistry.getAvailableTTS();
      expect(all.some((p) => p.name === "mimo")).toBe(true);
    }
  });

  it("should get default ASR provider", async () => {
    const { voiceRegistry } = await import("./providers.js");
    await import("./asr.js");

    const provider = voiceRegistry.getDefaultASR();
    if (process.env.GROQ_API_KEY) {
      expect(provider).not.toBeNull();
      expect(provider!.name).toBe("groq");
    }
  });

  it("should get default TTS provider", async () => {
    const { voiceRegistry } = await import("./providers.js");
    await import("./tts.js");

    const provider = voiceRegistry.getDefaultTTS();
    if (process.env.MIMO_API_KEY) {
      expect(provider).not.toBeNull();
      expect(provider!.name).toBe("mimo");
    }
  });

  it("should prefer specified provider when available", async () => {
    const { voiceRegistry } = await import("./providers.js");
    await import("./asr.js");

    // Requesting a non-existent provider should fall back to available ones
    const provider = voiceRegistry.getDefaultASR("nonexistent");
    if (process.env.GROQ_API_KEY) {
      expect(provider).not.toBeNull();
      expect(provider!.name).toBe("groq");
    }
  });

  it("should return null when no providers available", async () => {
    const { voiceRegistry } = await import("./providers.js");

    // Without any providers registered for a fake name
    const provider = voiceRegistry.getASR("fake-provider");
    expect(provider).toBeUndefined();
  });
});
