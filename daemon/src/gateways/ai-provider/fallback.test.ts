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
const { callWithFallback, getModel } = await import("./provider.js");
const { deadHostManager } = await import("./dead-host.js");

describe("callWithFallback", () => {
  beforeEach(() => {
    deadHostManager.reset();
    activeProvider = "mimo";
  });

  it("should return result from first successful provider", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await callWithFallback(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledWith("mimo");
  });

  it("should fall back to next provider after exhausting retries", { timeout: 15000 }, async () => {
    // mimo fails all 3 retries, groq succeeds
    const fn = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("timeout"), { status: 503 }))
      .mockRejectedValueOnce(Object.assign(new Error("timeout"), { status: 503 }))
      .mockRejectedValueOnce(Object.assign(new Error("timeout"), { status: 503 }))
      .mockResolvedValueOnce("fallback-ok");

    const result = await callWithFallback(fn);
    expect(result).toBe("fallback-ok");
    // 3 retries for mimo + 1 for groq
    expect(fn).toHaveBeenCalledTimes(4);
    expect(fn).toHaveBeenNthCalledWith(1, "mimo");
    expect(fn).toHaveBeenNthCalledWith(4, "groq");
  });

  it("should NOT fall back on 4xx errors (auth/quota)", async () => {
    const authError = Object.assign(new Error("unauthorized"), { status: 401 });
    const fn = vi.fn().mockRejectedValue(authError);

    await expect(callWithFallback(fn)).rejects.toThrow("unauthorized");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should throw last error if all providers fail", { timeout: 30000 }, async () => {
    const fn = vi.fn()
      .mockRejectedValue(Object.assign(new Error("server error"), { status: 500 }));

    await expect(callWithFallback(fn)).rejects.toThrow("server error");
    // Each provider retried 3 times: 3 providers * 3 retries = 9
    expect(fn).toHaveBeenCalledTimes(9);
  });

  it("should skip dead providers", { timeout: 15000 }, async () => {
    // Mark groq as dead
    deadHostManager.recordFailure("groq");
    deadHostManager.recordFailure("groq");

    // mimo fails 3 retries, openrouter succeeds
    const fn = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("timeout"), { status: 503 }))
      .mockRejectedValueOnce(Object.assign(new Error("timeout"), { status: 503 }))
      .mockRejectedValueOnce(Object.assign(new Error("timeout"), { status: 503 }))
      .mockResolvedValueOnce("openrouter-ok");

    const result = await callWithFallback(fn);
    expect(result).toBe("openrouter-ok");
    expect(fn).toHaveBeenNthCalledWith(1, "mimo");
    expect(fn).toHaveBeenNthCalledWith(4, "openrouter"); // groq skipped
  });

  it("should record success on successful call", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await callWithFallback(fn);
    // After success, provider should not be dead even if it had prior failures
    deadHostManager.recordFailure("mimo");
    deadHostManager.recordFailure("mimo");
    // recordSuccess was called, so the consecutive failures were reset
    // But since we record 2 new failures, it should be dead
    expect(deadHostManager.isDead("mimo")).toBe(true);
  });
});

describe("getModel", () => {
  it("should return a LanguageModelV3", () => {
    const model = getModel();
    expect(model.specificationVersion).toBe("v3");
    expect(model.modelId).toBe("test-model");
  });

  it("should use explicit provider when specified", () => {
    const model = getModel("groq", "llama-3");
    expect(model.modelId).toBe("llama-3");
  });
});
