import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  resolveProvider,
  probeEnvApiKey,
  probeEnvBaseUrl,
  inferProviderFromUrl,
} from "../provider-resolver.js";

describe("Provider Resolver with Environment Probing", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_BASE_URL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("probes DEEPSEEK_API_KEY and resolves deepseek provider automatically", () => {
    process.env.DEEPSEEK_API_KEY = "sk-deepseek-test-key-12345";
    expect(probeEnvApiKey("deepseek")).toBe("sk-deepseek-test-key-12345");

    const resolved = resolveProvider("deepseek");
    expect(resolved.apiKey).toBe("sk-deepseek-test-key-12345");
    expect(resolved.baseURL).toBe("https://api.deepseek.com/v1");
  });

  it("respects custom base URL environment variable overrides", () => {
    process.env.DEEPSEEK_API_KEY = "sk-custom-key";
    process.env.DEEPSEEK_BASE_URL = "https://custom.deepseek.proxy/v1";

    expect(probeEnvBaseUrl("deepseek")).toBe("https://custom.deepseek.proxy/v1");

    const resolved = resolveProvider("deepseek");
    expect(resolved.apiKey).toBe("sk-custom-key");
    expect(resolved.baseURL).toBe("https://custom.deepseek.proxy/v1");
  });

  it("probes OPENAI_API_KEY for openai provider", () => {
    process.env.OPENAI_API_KEY = "sk-proj-openai-test-key";

    const resolved = resolveProvider("openai");
    expect(resolved.apiKey).toBe("sk-proj-openai-test-key");
    expect(resolved.baseURL).toBe("https://api.openai.com/v1");
  });

  it("infers provider from deepseek API URL", () => {
    expect(inferProviderFromUrl("https://api.deepseek.com/chat/completions")).toBe("deepseek");
  });

  it("resolves ollama without API key using default localhost baseURL", () => {
    const resolved = resolveProvider("ollama");
    expect(resolved.baseURL).toContain("11434");
    expect(resolved.apiKey).toBe("");
  });
});
