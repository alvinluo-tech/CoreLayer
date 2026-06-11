import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockGetRoutingRules, mockSetRoutingRules, mockGetActiveModel, mockSetActiveModel, mockGetProfile, mockGetAllProfiles, mockResetGateway, mockGetAll } = vi.hoisted(() => ({
  mockGetRoutingRules: vi.fn(),
  mockSetRoutingRules: vi.fn(),
  mockGetActiveModel: vi.fn(),
  mockSetActiveModel: vi.fn(),
  mockGetProfile: vi.fn(),
  mockGetAllProfiles: vi.fn(),
  mockResetGateway: vi.fn(),
  mockGetAll: vi.fn(),
}));

vi.mock("../../../config/config-manager.js", () => ({
  configManager: {
    getRoutingRules: (...args: unknown[]) => mockGetRoutingRules(...args),
    setRoutingRules: (...args: unknown[]) => mockSetRoutingRules(...args),
    getActiveModel: (...args: unknown[]) => mockGetActiveModel(...args),
    setActiveModel: (...args: unknown[]) => mockSetActiveModel(...args),
  },
}));

vi.mock("../../../persistence/factory.js", () => ({
  getRepositories: () => ({
    modelProfiles: {
      getAll: (...args: unknown[]) => mockGetAll(...args),
      delete: vi.fn().mockResolvedValue(true),
      upsert: vi.fn().mockResolvedValue({ id: "mp-1" }),
    },
  }),
}));

vi.mock("../../../gateways/model/gateway.js", () => ({
  resetGateway: (...args: unknown[]) => mockResetGateway(...args),
  getModelGateway: () => ({
    getProfile: (...args: unknown[]) => mockGetProfile(...args),
    getAllProfiles: (...args: unknown[]) => mockGetAllProfiles(...args),
  }),
}));

vi.mock("@jarvis/model-gateway", () => ({
  DEFAULT_ROUTING_RULES: [{ taskType: "chat", modelId: "auto" }],
}));

vi.mock("../../../shared/errors.js", () => ({
  apiError: vi.fn((_c: unknown, message: string, status = 500) =>
    new Response(JSON.stringify({ error: message }), { status }),
  ),
  logError: vi.fn(),
}));

import app from "../settings-model.js";

function makeRequest(path: string, method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`http://localhost${path}`, init);
}

describe("settings-model route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRoutingRules.mockReturnValue([]);
    mockGetActiveModel.mockReturnValue("auto");
    mockGetProfile.mockReturnValue(null);
    mockGetAllProfiles.mockReturnValue([]);
    mockGetAll.mockResolvedValue([]);
  });

  describe("GET /routing-rules", () => {
    it("returns custom rules when set", async () => {
      mockGetRoutingRules.mockReturnValue([{ taskType: "chat", modelId: "gpt-4" }]);

      const res = await app.fetch(makeRequest("/routing-rules"));
      const json = (await res.json()) as { rules: unknown[]; isCustom: boolean };

      expect(res.status).toBe(200);
      expect(json.isCustom).toBe(true);
      expect(json.rules).toHaveLength(1);
    });

    it("returns defaults when no custom rules", async () => {
      mockGetRoutingRules.mockReturnValue([]);

      const res = await app.fetch(makeRequest("/routing-rules"));
      const json = (await res.json()) as { isCustom: boolean };

      expect(json.isCustom).toBe(false);
    });
  });

  describe("PUT /routing-rules", () => {
    it("updates routing rules", async () => {
      const res = await app.fetch(
        makeRequest("/routing-rules", "PUT", {
          rules: [{ taskType: "chat", modelId: "gpt-4" }],
        }),
      );
      const json = (await res.json()) as { success: boolean };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockSetRoutingRules).toHaveBeenCalled();
      expect(mockResetGateway).toHaveBeenCalled();
    });

    it("returns 400 when rules is not an array", async () => {
      const res = await app.fetch(
        makeRequest("/routing-rules", "PUT", { rules: "invalid" }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when rule missing taskType", async () => {
      const res = await app.fetch(
        makeRequest("/routing-rules", "PUT", {
          rules: [{ modelId: "gpt-4" }],
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("GET /active-model", () => {
    it("returns auto model with virtual profile", async () => {
      mockGetActiveModel.mockReturnValue("auto");

      const res = await app.fetch(makeRequest("/active-model"));
      const json = (await res.json()) as { modelId: string; profile: { id: string } };

      expect(res.status).toBe(200);
      expect(json.modelId).toBe("auto");
      expect(json.profile?.id).toBe("auto");
    });

    it("returns specific model profile", async () => {
      mockGetActiveModel.mockReturnValue("gpt-4");
      mockGetProfile.mockReturnValue({ id: "gpt-4", displayName: "GPT-4" });

      const res = await app.fetch(makeRequest("/active-model"));
      const json = (await res.json()) as { modelId: string; profile: { id: string } };

      expect(json.modelId).toBe("gpt-4");
      expect(json.profile?.id).toBe("gpt-4");
    });
  });

  describe("PUT /active-model", () => {
    it("sets active model to auto", async () => {
      const res = await app.fetch(
        makeRequest("/active-model", "PUT", { modelId: "auto" }),
      );
      const json = (await res.json()) as { success: boolean };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockSetActiveModel).toHaveBeenCalledWith("auto");
    });

    it("sets active model to specific profile", async () => {
      mockGetProfile.mockReturnValue({ id: "gpt-4" });

      const res = await app.fetch(
        makeRequest("/active-model", "PUT", { modelId: "gpt-4" }),
      );
      expect(res.status).toBe(200);
    });

    it("returns 400 when modelId is missing", async () => {
      const res = await app.fetch(
        makeRequest("/active-model", "PUT", {}),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when model not found", async () => {
      mockGetProfile.mockReturnValue(null);
      mockGetAll.mockResolvedValue([]);

      const res = await app.fetch(
        makeRequest("/active-model", "PUT", { modelId: "nonexistent" }),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("GET /model-profiles", () => {
    it("returns profiles including auto", async () => {
      mockGetAllProfiles.mockReturnValue([{ id: "gpt-4" }]);

      const res = await app.fetch(makeRequest("/model-profiles"));
      const json = (await res.json()) as { profiles: { id: string }[] };

      expect(res.status).toBe(200);
      expect(json.profiles).toHaveLength(2);
      expect(json.profiles[0].id).toBe("auto");
    });
  });

  describe("POST /model-profiles", () => {
    it("creates model profile", async () => {
      const res = await app.fetch(
        makeRequest("/model-profiles", "POST", {
          provider: "openai",
          modelName: "gpt-4",
          displayName: "GPT-4",
        }),
      );
      const json = (await res.json()) as { success: boolean };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("returns 400 when provider missing", async () => {
      const res = await app.fetch(
        makeRequest("/model-profiles", "POST", { modelName: "gpt-4" }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when modelName missing", async () => {
      const res = await app.fetch(
        makeRequest("/model-profiles", "POST", { provider: "openai" }),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /model-profiles/:id", () => {
    it("deletes a model profile", async () => {
      const res = await app.fetch(makeRequest("/model-profiles/mp-1", "DELETE"));
      const json = (await res.json()) as { success: boolean };

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });
  });
});
