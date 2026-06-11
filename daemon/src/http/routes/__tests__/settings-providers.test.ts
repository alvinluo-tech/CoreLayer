import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockGetProviders, mockGetCredentials, mockSetProvider, mockSetCredential, mockRemoveProvider, mockResetGateway, mockMaskApiKey, mockIsMaskedKey } = vi.hoisted(() => ({
  mockGetProviders: vi.fn(),
  mockGetCredentials: vi.fn(),
  mockSetProvider: vi.fn(),
  mockSetCredential: vi.fn(),
  mockRemoveProvider: vi.fn(),
  mockResetGateway: vi.fn(),
  mockMaskApiKey: vi.fn(),
  mockIsMaskedKey: vi.fn(),
}));

vi.mock("../../../config/config-manager.js", () => ({
  configManager: {
    getProviders: (...args: unknown[]) => mockGetProviders(...args),
    getCredentials: (...args: unknown[]) => mockGetCredentials(...args),
    setProvider: (...args: unknown[]) => mockSetProvider(...args),
    setCredential: (...args: unknown[]) => mockSetCredential(...args),
    removeProvider: (...args: unknown[]) => mockRemoveProvider(...args),
  },
}));

vi.mock("../../../config/provider-resolver.js", () => ({
  LEGACY_DEFAULTS: {
    openai: { baseURL: "https://api.openai.com/v1" },
    anthropic: { baseURL: "https://api.anthropic.com/v1" },
  },
}));

vi.mock("../../../gateways/model/gateway.js", () => ({
  resetGateway: (...args: unknown[]) => mockResetGateway(...args),
}));

vi.mock("@jarvis/model-gateway", () => ({
  PROVIDER_PRESETS: [
    { id: "openai", name: "OpenAI", type: "openai_compatible", defaultBaseURL: "https://api.openai.com/v1" },
  ],
}));

vi.mock("../../../shared/errors.js", () => ({
  apiError: vi.fn((_c: unknown, message: string, status = 500) =>
    new Response(JSON.stringify({ error: message }), { status }),
  ),
  logError: vi.fn(),
}));

vi.mock("../settings-helpers.js", () => ({
  maskApiKey: (...args: unknown[]) => mockMaskApiKey(...args),
  isMaskedKey: (...args: unknown[]) => mockIsMaskedKey(...args),
}));

import app from "../settings-providers.js";

function makeRequest(path: string, method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`http://localhost${path}`, init);
}

describe("settings-providers route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProviders.mockReturnValue([]);
    mockGetCredentials.mockReturnValue({});
    mockMaskApiKey.mockImplementation((k: string | undefined) => k ? "*".repeat(Math.max(0, k.length - 4)) + k.slice(-4) : "");
    mockIsMaskedKey.mockImplementation((k: string) => /^\*{4,}/.test(k));
  });

  describe("GET /providers/presets", () => {
    it("returns provider presets", async () => {
      const res = await app.fetch(makeRequest("/providers/presets"));
      const json = (await res.json()) as { presets: unknown[] };

      expect(res.status).toBe(200);
      expect(json.presets).toHaveLength(1);
    });
  });

  describe("GET /providers", () => {
    it("returns stored providers", async () => {
      mockGetProviders.mockReturnValue([
        { id: "openai", name: "OpenAI", type: "openai_compatible", baseURL: "https://api.openai.com/v1", enabled: true },
      ]);
      mockGetCredentials.mockReturnValue({ openai: "sk-test" });

      const res = await app.fetch(makeRequest("/providers"));
      const json = (await res.json()) as { providers: unknown[]; isLegacy: boolean };

      expect(res.status).toBe(200);
      expect(json.providers).toHaveLength(1);
      expect(json.isLegacy).toBe(false);
    });

    it("returns legacy view when no stored providers", async () => {
      mockGetProviders.mockReturnValue([]);
      mockGetCredentials.mockReturnValue({ openai: "sk-test" });

      const res = await app.fetch(makeRequest("/providers"));
      const json = (await res.json()) as { providers: Record<string, unknown>; isLegacy: boolean };

      expect(res.status).toBe(200);
      expect(json.isLegacy).toBe(true);
      expect(json.providers).toHaveProperty("openai");
    });
  });

  describe("POST /providers", () => {
    it("creates a new provider", async () => {
      const res = await app.fetch(
        makeRequest("/providers", "POST", {
          id: "custom",
          name: "Custom Provider",
          baseURL: "https://custom.api.com/v1",
          apiKey: "key-123",
        }),
      );
      const json = (await res.json()) as { success: boolean };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockSetProvider).toHaveBeenCalled();
      expect(mockSetCredential).toHaveBeenCalledWith("custom", "key-123");
      expect(mockResetGateway).toHaveBeenCalled();
    });

    it("returns 400 when required fields missing", async () => {
      const res = await app.fetch(
        makeRequest("/providers", "POST", { id: "custom" }),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("PUT /providers/:id", () => {
    it("updates existing provider", async () => {
      mockGetProviders.mockReturnValue([
        { id: "openai", name: "OpenAI", type: "openai_compatible", baseURL: "https://api.openai.com/v1", enabled: true },
      ]);

      const res = await app.fetch(
        makeRequest("/providers/openai", "PUT", { name: "OpenAI Updated" }),
      );
      const json = (await res.json()) as { success: boolean };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockResetGateway).toHaveBeenCalled();
    });

    it("creates legacy provider as new stored provider", async () => {
      mockGetProviders.mockReturnValue([]);

      const res = await app.fetch(
        makeRequest("/providers/openai", "PUT", { apiKey: "sk-new" }),
      );
      const json = (await res.json()) as { success: boolean };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });
  });

  describe("DELETE /providers/:id", () => {
    it("deletes a provider", async () => {
      const res = await app.fetch(makeRequest("/providers/openai", "DELETE"));
      const json = (await res.json()) as { success: boolean };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockRemoveProvider).toHaveBeenCalledWith("openai");
      expect(mockResetGateway).toHaveBeenCalled();
    });
  });

  describe("GET /providers/legacy", () => {
    it("returns legacy provider credentials", async () => {
      mockGetCredentials.mockReturnValue({ openai: "sk-test" });

      const res = await app.fetch(makeRequest("/providers/legacy"));
      const json = (await res.json()) as { providers: Record<string, { apiKey: string; baseURL: string }> };

      expect(res.status).toBe(200);
      expect(json.providers).toHaveProperty("openai");
    });
  });

  // ---- POST /providers/:id/discover ----
  describe("POST /providers/:id/discover", () => {
    it("returns 404 when provider not found", async () => {
      mockGetProviders.mockReturnValue([]);
      const res = await app.fetch(makeRequest("/providers/unknown/discover", "POST"));
      expect(res.status).toBe(404);
    });

    it("discovers models from provider", async () => {
      mockGetProviders.mockReturnValue([
        { id: "openai", name: "OpenAI", type: "openai_compatible", baseURL: "https://api.openai.com/v1", enabled: true },
      ]);
      mockGetCredentials.mockReturnValue({ openai: "sk-test" });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ id: "gpt-4", name: "GPT-4" }] }),
      });

      const res = await app.fetch(makeRequest("/providers/openai/discover", "POST"));
      const json = (await res.json()) as { models: Array<{ id: string; name: string }> };
      expect(res.status).toBe(200);
      expect(json.models).toHaveLength(1);
      expect(json.models[0].id).toBe("gpt-4");

      vi.restoreAllMocks();
    });

    it("returns 502 when fetch fails", async () => {
      mockGetProviders.mockReturnValue([
        { id: "openai", name: "OpenAI", type: "openai_compatible", baseURL: "https://api.openai.com/v1", enabled: true },
      ]);
      mockGetCredentials.mockReturnValue({ openai: "sk-test" });

      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
      const res = await app.fetch(makeRequest("/providers/openai/discover", "POST"));
      expect(res.status).toBe(502);

      vi.restoreAllMocks();
    });

    it("returns 502 when response not ok", async () => {
      mockGetProviders.mockReturnValue([
        { id: "openai", name: "OpenAI", type: "openai_compatible", baseURL: "https://api.openai.com/v1", enabled: true },
      ]);
      mockGetCredentials.mockReturnValue({ openai: "sk-test" });

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      });
      const res = await app.fetch(makeRequest("/providers/openai/discover", "POST"));
      expect(res.status).toBe(502);

      vi.restoreAllMocks();
    });

    it("skips Authorization header for ollama key", async () => {
      mockGetProviders.mockReturnValue([
        { id: "ollama", name: "Ollama", type: "openai_compatible", baseURL: "http://localhost:11434/v1", enabled: true },
      ]);
      mockGetCredentials.mockReturnValue({ ollama: "ollama" });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ id: "llama3" }] }),
      });

      const res = await app.fetch(makeRequest("/providers/ollama/discover", "POST"));
      expect(res.status).toBe(200);

      vi.restoreAllMocks();
    });
  });

  // ---- POST /providers/:id/test ----
  describe("POST /providers/:id/test", () => {
    it("returns 404 when provider not found", async () => {
      mockGetProviders.mockReturnValue([]);
      const res = await app.fetch(makeRequest("/providers/unknown/test", "POST"));
      expect(res.status).toBe(404);
    });

    it("returns success when connection works", async () => {
      mockGetProviders.mockReturnValue([
        { id: "openai", name: "OpenAI", type: "openai_compatible", baseURL: "https://api.openai.com/v1", enabled: true },
      ]);
      mockGetCredentials.mockReturnValue({ openai: "sk-test" });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      const res = await app.fetch(makeRequest("/providers/openai/test", "POST"));
      const json = (await res.json()) as { success: boolean; latencyMs: number; keyConfigured: boolean };
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.keyConfigured).toBe(true);

      vi.restoreAllMocks();
    });

    it("returns error on 401/403", async () => {
      mockGetProviders.mockReturnValue([
        { id: "openai", name: "OpenAI", type: "openai_compatible", baseURL: "https://api.openai.com/v1", enabled: true },
      ]);
      mockGetCredentials.mockReturnValue({ openai: "sk-test" });

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      const res = await app.fetch(makeRequest("/providers/openai/test", "POST"));
      const json = (await res.json()) as { success: boolean; error: string };
      expect(json.success).toBe(false);
      expect(json.error).toContain("401");

      vi.restoreAllMocks();
    });

    it("returns error on non-ok status", async () => {
      mockGetProviders.mockReturnValue([
        { id: "openai", name: "OpenAI", type: "openai_compatible", baseURL: "https://api.openai.com/v1", enabled: true },
      ]);
      mockGetCredentials.mockReturnValue({ openai: "sk-test" });

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const res = await app.fetch(makeRequest("/providers/openai/test", "POST"));
      const json = (await res.json()) as { success: boolean; error: string };
      expect(json.success).toBe(false);
      expect(json.error).toContain("500");

      vi.restoreAllMocks();
    });

    it("returns error on fetch failure", async () => {
      mockGetProviders.mockReturnValue([
        { id: "openai", name: "OpenAI", type: "openai_compatible", baseURL: "https://api.openai.com/v1", enabled: true },
      ]);
      mockGetCredentials.mockReturnValue({ openai: "sk-test" });

      global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));
      const res = await app.fetch(makeRequest("/providers/openai/test", "POST"));
      const json = (await res.json()) as { success: boolean; error: string };
      expect(json.success).toBe(false);

      vi.restoreAllMocks();
    });

    it("uses openrouter auth endpoint for openrouter providers", async () => {
      mockGetProviders.mockReturnValue([
        { id: "openrouter", name: "OpenRouter", type: "openai_compatible", baseURL: "https://openrouter.ai/api/v1", enabled: true },
      ]);
      mockGetCredentials.mockReturnValue({ openrouter: "sk-or-test" });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      const res = await app.fetch(makeRequest("/providers/openrouter/test", "POST"));
      const json = (await res.json()) as { success: boolean };
      expect(json.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://openrouter.ai/api/v1/auth/key",
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer sk-or-test" }) }),
      );

      vi.restoreAllMocks();
    });

    it("reports keyConfigured=false when no key", async () => {
      mockGetProviders.mockReturnValue([
        { id: "ollama", name: "Ollama", type: "openai_compatible", baseURL: "http://localhost:11434/v1", enabled: true },
      ]);
      mockGetCredentials.mockReturnValue({ ollama: "ollama" });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      const res = await app.fetch(makeRequest("/providers/ollama/test", "POST"));
      const json = (await res.json()) as { success: boolean; keyConfigured: boolean };
      expect(json.keyConfigured).toBe(false);

      vi.restoreAllMocks();
    });
  });

  // ---- PUT /providers/:id - additional scenarios ----
  describe("PUT /providers/:id - additional", () => {
    it("preserves existing fields when updating", async () => {
      mockGetProviders.mockReturnValue([
        { id: "openai", name: "OpenAI", type: "openai_compatible", baseURL: "https://api.openai.com/v1", enabled: true },
      ]);

      const res = await app.fetch(
        makeRequest("/providers/openai", "PUT", { enabled: false }),
      );
      const json = (await res.json()) as { success: boolean };
      expect(json.success).toBe(true);
      expect(mockSetProvider).toHaveBeenCalledWith("openai", expect.objectContaining({
        name: "OpenAI",
        baseURL: "https://api.openai.com/v1",
        enabled: false,
      }));
    });

    it("skips masked API key on update", async () => {
      mockGetProviders.mockReturnValue([
        { id: "openai", name: "OpenAI", type: "openai_compatible", baseURL: "https://api.openai.com/v1", enabled: true },
      ]);

      const res = await app.fetch(
        makeRequest("/providers/openai", "PUT", { apiKey: "****" }),
      );
      expect(res.status).toBe(200);
      expect(mockSetCredential).not.toHaveBeenCalled();
    });

    it("creates provider from preset when not in stored list", async () => {
      mockGetProviders.mockReturnValue([]);

      const res = await app.fetch(
        makeRequest("/providers/openai", "PUT", { apiKey: "sk-new" }),
      );
      expect(res.status).toBe(200);
      expect(mockSetProvider).toHaveBeenCalledWith("openai", expect.objectContaining({
        name: "OpenAI",
      }));
    });
  });
});
