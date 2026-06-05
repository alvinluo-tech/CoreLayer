import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./config-manager.js", () => ({
  configManager: {
    getProviderConfig: vi.fn(),
  },
}));

import { inferProviderFromUrl, resolveProvider, LEGACY_DEFAULTS } from "./provider-resolver.js";
import { configManager } from "./config-manager.js";

const mockGetProviderConfig = vi.mocked(configManager.getProviderConfig);

describe("inferProviderFromUrl", () => {
  it("should detect groq from api.groq.com", () => {
    expect(inferProviderFromUrl("https://api.groq.com/openai/v1")).toBe("groq");
  });

  it("should detect openrouter from openrouter.ai", () => {
    expect(inferProviderFromUrl("https://openrouter.ai/api/v1")).toBe("openrouter");
  });

  it("should detect anthropic from api.anthropic.com", () => {
    expect(inferProviderFromUrl("https://api.anthropic.com/v1")).toBe("anthropic");
  });

  it("should detect openai from api.openai.com", () => {
    expect(inferProviderFromUrl("https://api.openai.com/v1")).toBe("openai");
  });

  it("should detect gemini from generativelanguage.googleapis.com", () => {
    expect(inferProviderFromUrl("https://generativelanguage.googleapis.com/v1")).toBe("gemini");
  });

  it("should return null for unknown hostname", () => {
    expect(inferProviderFromUrl("https://custom-api.example.com/v1")).toBeNull();
  });

  it("should return null for invalid URL", () => {
    expect(inferProviderFromUrl("not-a-url")).toBeNull();
  });
});

describe("resolveProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should resolve from configManager first", () => {
    mockGetProviderConfig.mockReturnValue({
      baseURL: "https://custom.api.com/v1",
      apiKey: "custom-key",
    });

    const result = resolveProvider("custom-provider");

    expect(result.baseURL).toBe("https://custom.api.com/v1");
    expect(result.apiKey).toBe("custom-key");
    expect(mockGetProviderConfig).toHaveBeenCalledWith("custom-provider");
  });

  it("should fall back to legacy defaults when configManager throws", () => {
    mockGetProviderConfig.mockImplementation(() => {
      throw new Error("not found");
    });

    const originalEnv = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = "groq-test-key";

    const result = resolveProvider("groq");

    expect(result.baseURL).toBe(LEGACY_DEFAULTS.groq.baseURL);
    expect(result.apiKey).toBe("groq-test-key");

    if (originalEnv !== undefined) {
      process.env.GROQ_API_KEY = originalEnv;
    } else {
      delete process.env.GROQ_API_KEY;
    }
  });

  it("should return empty apiKey for legacy providers without env key", () => {
    mockGetProviderConfig.mockImplementation(() => {
      throw new Error("not found");
    });

    const result = resolveProvider("local");

    expect(result.baseURL).toBe("http://localhost:11434/v1");
    expect(result.apiKey).toBe("");
  });

  it("should throw for unknown provider", () => {
    mockGetProviderConfig.mockImplementation(() => {
      throw new Error("not found");
    });

    expect(() => resolveProvider("unknown-provider")).toThrow("Provider not configured");
  });
});
