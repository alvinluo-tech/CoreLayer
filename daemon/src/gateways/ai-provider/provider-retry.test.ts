import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock configManager
const mockProviders = [
  { id: "groq", enabled: true },
  { id: "openrouter", enabled: true },
  { id: "mimo", enabled: true },
];
let activeProvider = "mimo";

vi.mock("../../config/config-manager.js", () => ({
  configManager: {
    getActiveProvider: () => activeProvider,
    getActiveModel: () => "test-model",
    getProviders: () => mockProviders,
  },
}));

vi.mock("../../config/provider-resolver.js", () => ({
  resolveProvider: (name: string) => ({
    baseURL: `https://${name}.example.com/v1`,
    apiKey: "test-key",
  }),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => ({
    chat: (modelId: string) => ({
      specificationVersion: "v3" as const,
      provider: "openai",
      modelId,
      supportedUrls: {},
      doGenerate: vi.fn(),
      doStream: vi.fn(),
    }),
  }),
}));

vi.mock("@jarvis/model-gateway", () => ({
  DEFAULT_PROFILES: [],
}));

// Import after mocks
const { callWithFallback } = await import("./provider.js");
const { deadHostManager } = await import("./dead-host.js");

describe("callWithFallback retry", () => {
  beforeEach(() => {
    deadHostManager.reset();
    activeProvider = "mimo";
  });

  it("should retry on 429 and succeed on second attempt", { timeout: 10000 }, async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }))
      .mockResolvedValueOnce("ok");

    const result = await callWithFallback(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should retry on 503 and succeed on third attempt", { timeout: 15000 }, async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("unavailable"), { status: 503 }))
      .mockRejectedValueOnce(Object.assign(new Error("unavailable"), { status: 503 }))
      .mockResolvedValueOnce("ok");

    const result = await callWithFallback(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should fallback after exhausting retries", { timeout: 15000 }, async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }))
      .mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }))
      .mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }))
      .mockResolvedValueOnce("fallback-ok");

    const result = await callWithFallback(fn);
    expect(result).toBe("fallback-ok");
    // 3 retries for mimo + 1 for groq
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("should NOT retry non-retryable errors (401)", async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error("unauthorized"), { status: 401 }));

    await expect(callWithFallback(fn)).rejects.toThrow("unauthorized");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should NOT retry non-retryable errors (400)", async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error("bad request"), { status: 400 }));

    await expect(callWithFallback(fn)).rejects.toThrow("bad request");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry on timeout errors", { timeout: 10000 }, async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("ETIMEDOUT"))
      .mockResolvedValueOnce("ok");

    const result = await callWithFallback(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
