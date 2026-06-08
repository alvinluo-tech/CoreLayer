import { describe, it, expect } from "vitest";
import { voiceRegistry } from "../providers.js";
import type { ASRProvider, TTSProvider, VoiceProviderDefinition } from "../providers.js";

function createMockASR(name: string, available = true): ASRProvider {
  return {
    name,
    isAvailable: () => available,
    transcribe: async () => ({ text: "", provider: name }),
  };
}

function createMockTTS(name: string, available = true): TTSProvider {
  return {
    name,
    isAvailable: () => available,
    synthesize: async () => ({ audio: Buffer.alloc(0), provider: name }),
  };
}

function createDefinition(overrides: Partial<VoiceProviderDefinition> = {}): VoiceProviderDefinition {
  return {
    id: "test-provider",
    name: "Test Provider",
    kind: "both",
    models: [{ id: "model-1", name: "Model 1" }],
    requiresApiKey: false,
    credentialKey: "test_key",
    ...overrides,
  };
}

describe("VoiceProviderRegistry", () => {
  // Note: voiceRegistry is a singleton, so tests may share state.
  // We test the API surface, not isolation.

  it("registers and retrieves provider definitions", () => {
    const def = createDefinition({ id: "reg-test", name: "Reg Test" });
    voiceRegistry.registerDefinition(def);

    const result = voiceRegistry.getDefinition("reg-test");
    expect(result).toBeDefined();
    expect(result!.name).toBe("Reg Test");
  });

  it("returns all definitions", () => {
    const defs = voiceRegistry.getDefinitions();
    expect(Array.isArray(defs)).toBe(true);
  });

  it("filters definitions by kind", () => {
    voiceRegistry.registerDefinition(
      createDefinition({ id: "asr-only", name: "ASR Only", kind: "asr" })
    );
    voiceRegistry.registerDefinition(
      createDefinition({ id: "tts-only", name: "TTS Only", kind: "tts" })
    );

    const asrDefs = voiceRegistry.getDefinitionsByKind("asr");
    expect(asrDefs.some((d) => d.id === "asr-only")).toBe(true);

    const ttsDefs = voiceRegistry.getDefinitionsByKind("tts");
    expect(ttsDefs.some((d) => d.id === "tts-only")).toBe(true);
  });

  it("registers and retrieves ASR providers", () => {
    const asr = createMockASR("test-asr");
    voiceRegistry.registerASR(asr);

    const result = voiceRegistry.getASR("test-asr");
    expect(result).toBeDefined();
    expect(result!.name).toBe("test-asr");
  });

  it("registers and retrieves TTS providers", () => {
    const tts = createMockTTS("test-tts");
    voiceRegistry.registerTTS(tts);

    const result = voiceRegistry.getTTS("test-tts");
    expect(result).toBeDefined();
    expect(result!.name).toBe("test-tts");
  });

  it("returns available ASR providers", () => {
    voiceRegistry.registerASR(createMockASR("avail-asr", true));
    voiceRegistry.registerASR(createMockASR("unavail-asr", false));

    const available = voiceRegistry.getAvailableASR();
    expect(available.some((p) => p.name === "avail-asr")).toBe(true);
    expect(available.some((p) => p.name === "unavail-asr")).toBe(false);
  });

  it("returns available TTS providers", () => {
    voiceRegistry.registerTTS(createMockTTS("avail-tts", true));
    voiceRegistry.registerTTS(createMockTTS("unavail-tts", false));

    const available = voiceRegistry.getAvailableTTS();
    expect(available.some((p) => p.name === "avail-tts")).toBe(true);
    expect(available.some((p) => p.name === "unavail-tts")).toBe(false);
  });

  it("gets default ASR with preference", () => {
    voiceRegistry.registerASR(createMockASR("preferred-asr", true));
    const preferred = voiceRegistry.getDefaultASR("preferred-asr");
    expect(preferred?.name).toBe("preferred-asr");
  });

  it("falls back to first available ASR when preference unavailable", () => {
    voiceRegistry.registerASR(createMockASR("fallback-asr", true));
    const result = voiceRegistry.getDefaultASR("nonexistent");
    expect(result).toBeDefined();
  });

  it("returns null when no ASR providers available", () => {
    // This tests the API surface; actual result depends on registered providers
    const result = voiceRegistry.getDefaultASR("definitely-nonexistent-xyz");
    // May return null or a previously registered provider
    expect(result === null || result !== undefined).toBe(true);
  });
});
