import { describe, it, expect, beforeEach, vi } from "vitest";

const mockGetRoutingRules = vi.hoisted(() => vi.fn());
const mockGetActiveModel = vi.hoisted(() => vi.fn());
const mockGetActiveProvider = vi.hoisted(() => vi.fn());
const mockGetProviders = vi.hoisted(() => vi.fn());
const mockGetRepositories = vi.hoisted(() => vi.fn());
const mockResolveProvider = vi.hoisted(() => vi.fn());

vi.mock("../../config/config-manager.js", () => ({
  configManager: {
    getRoutingRules: (...args: unknown[]) => mockGetRoutingRules(...args),
    getActiveModel: (...args: unknown[]) => mockGetActiveModel(...args),
    getActiveProvider: (...args: unknown[]) => mockGetActiveProvider(...args),
    getProviders: (...args: unknown[]) => mockGetProviders(...args),
  },
}));

vi.mock("../../config/provider-resolver.js", () => ({
  resolveProvider: (...args: unknown[]) => mockResolveProvider(...args),
  LEGACY_DEFAULTS: {
    ollama: { baseURL: "http://localhost:11434", apiKey: "" },
  },
}));

vi.mock("../../persistence/factory.js", () => ({
  getRepositories: (...args: unknown[]) => mockGetRepositories(...args),
}));

vi.mock("@jarvis/model-gateway", () => {
  class MockModelGateway {
    config: Record<string, unknown>;
    constructor(config: Record<string, unknown>) {
      this.config = config;
    }
  }
  return {
    ModelGateway: MockModelGateway,
    DEFAULT_PROFILES: [
      { id: "default-model", provider: "default-provider", modelName: "gpt-4" },
    ],
    DEFAULT_ROUTING_RULES: [{ taskType: "general", modelId: "default-model" }],
  };
});

const { getModelGateway, resetGateway } = await import("./gateway.js");

describe("ModelGateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGateway();
    mockGetRoutingRules.mockReturnValue([]);
    mockGetActiveModel.mockReturnValue("default-model");
    mockGetActiveProvider.mockReturnValue("default-provider");
    mockGetProviders.mockReturnValue([]);
    mockGetRepositories.mockReturnValue({
      modelProfiles: { getAll: () => [] },
    });
    mockResolveProvider.mockReturnValue({
      baseURL: "https://api.openai.com/v1",
      apiKey: "test-key",
    });
  });

  describe("getModelGateway", () => {
    it("returns a gateway instance", () => {
      const gw = getModelGateway();
      expect(gw).toBeDefined();
    });

    it("caches the gateway instance", () => {
      const gw1 = getModelGateway();
      const gw2 = getModelGateway();
      expect(gw1).toBe(gw2);
    });

    it("returns new instance after resetGateway", () => {
      const gw1 = getModelGateway();
      resetGateway();
      const gw2 = getModelGateway();
      expect(gw1).not.toBe(gw2);
    });

    it("uses default profiles when no DB profiles exist", () => {
      const gw = getModelGateway();
      expect((gw as { config: Record<string, unknown> }).config.profiles).toEqual([
        { id: "default-model", provider: "default-provider", modelName: "gpt-4" },
      ]);
    });

    it("uses DB profiles when available", () => {
      mockGetRepositories.mockReturnValue({
        modelProfiles: {
          getAll: () => [
            {
              id: "db-model-1",
              provider: "db-provider",
              modelName: "claude-3",
              display_name: "Claude 3",
              capabilities: null,
              limits: null,
              cost: null,
            },
          ],
        },
      });

      const gw = getModelGateway();
      const config = (gw as { config: Record<string, unknown> }).config;
      const profiles = config.profiles as Array<{ id: string }>;
      expect(profiles).toHaveLength(1);
      expect(profiles[0].id).toBe("db-model-1");
    });

    it("uses custom routing rules when provided", () => {
      mockGetRoutingRules.mockReturnValue([{ taskType: "fast", modelId: "quick" }]);

      const gw = getModelGateway();
      const config = (gw as { config: Record<string, unknown> }).config;
      expect(config.routingRules).toEqual([{ taskType: "fast", modelId: "quick" }]);
    });

    it("builds providers from stored provider configs", () => {
      mockGetProviders.mockReturnValue([
        { id: "my-provider", name: "My Provider", type: "openai_compatible", enabled: true },
      ]);

      const gw = getModelGateway();
      const config = (gw as { config: Record<string, unknown> }).config;
      expect(config.providers).toHaveProperty("my-provider");
    });

    it("skips disabled providers", () => {
      mockGetProviders.mockReturnValue([
        { id: "disabled-provider", name: "Disabled", type: "openai_compatible", enabled: false },
      ]);

      const gw = getModelGateway();
      const config = (gw as { config: Record<string, unknown> }).config;
      expect(config.providers).not.toHaveProperty("disabled-provider");
    });

    it("skips provider requiring API key when none configured", () => {
      mockGetProviders.mockReturnValue([
        { id: "remote", name: "Remote", type: "openai_compatible", enabled: true },
      ]);
      mockResolveProvider.mockReturnValue({
        baseURL: "https://api.remote.com/v1",
        apiKey: "",
      });

      const gw = getModelGateway();
      const config = (gw as { config: Record<string, unknown> }).config;
      expect(config.providers).not.toHaveProperty("remote");
    });

    it("includes provider requiring API key when it is the active provider", () => {
      mockGetProviders.mockReturnValue([
        { id: "active-remote", name: "Active", type: "openai_compatible", enabled: true },
      ]);
      mockGetActiveProvider.mockReturnValue("active-remote");
      mockResolveProvider.mockReturnValue({
        baseURL: "https://api.remote.com/v1",
        apiKey: "",
      });

      const gw = getModelGateway();
      const config = (gw as { config: Record<string, unknown> }).config;
      expect(config.providers).toHaveProperty("active-remote");
    });

    it("includes ollama provider even without API key", () => {
      mockGetProviders.mockReturnValue([
        { id: "ollama", name: "Ollama", type: "ollama", enabled: true },
      ]);

      const gw = getModelGateway();
      const config = (gw as { config: Record<string, unknown> }).config;
      expect(config.providers).toHaveProperty("ollama");
    });

    it("includes legacy ollama provider when not already present", () => {
      const gw = getModelGateway();
      const config = (gw as { config: Record<string, unknown> }).config;
      expect(config.providers).toHaveProperty("ollama");
    });

    it("includes active model provider even without API key", () => {
      mockGetProviders.mockReturnValue([]);
      mockGetActiveModel.mockReturnValue("my-model");
      mockGetRepositories.mockReturnValue({
        modelProfiles: {
          getAll: () => [
            {
              id: "my-model",
              provider: "special-provider",
              modelName: "special-model",
              display_name: null,
              capabilities: null,
              limits: null,
              cost: null,
            },
          ],
        },
      });
      mockResolveProvider.mockReturnValue({
        baseURL: "https://api.special.com",
        apiKey: "",
      });

      const gw = getModelGateway();
      const config = (gw as { config: Record<string, unknown> }).config;
      expect(config.providers).toHaveProperty("special-provider");
    });
  });
});
