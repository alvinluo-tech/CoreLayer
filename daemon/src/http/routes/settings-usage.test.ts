import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockGetProfile } = vi.hoisted(() => ({
  mockGetProfile: vi.fn(),
}));

vi.mock("../../persistence/client.js", () => {
  let callCount = 0;

  const makeChain = (result: unknown) => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      all: vi.fn().mockReturnValue(result),
      get: vi.fn().mockReturnValue(result),
    };
    return chain;
  };

  return {
    db: {
      select: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return makeChain([]);
        }
        return makeChain({ count: 0 });
      }),
    },
    schema: {
      conversations: {
        modelUsed: "model_used",
        promptTokens: "prompt_tokens",
        completionTokens: "completion_tokens",
      },
    },
  };
});

vi.mock("drizzle-orm", () => ({
  sql: Object.assign(
    (...args: unknown[]) => ({ raw: args }),
    {
      raw: (val: string) => ({ raw: val }),
    },
  ),
}));

vi.mock("../../gateways/model/gateway.js", () => ({
  getModelGateway: () => ({
    getProfile: (...args: unknown[]) => mockGetProfile(...args),
  }),
}));

vi.mock("../../shared/errors.js", () => ({
  apiError: vi.fn((_c: unknown, message: string, status = 500) =>
    new Response(JSON.stringify({ error: message }), { status }),
  ),
  logError: vi.fn(),
}));

import app from "./settings-usage.js";

function makeRequest(path: string) {
  return new Request(`http://localhost${path}`, { method: "GET" });
}

describe("settings-usage route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProfile.mockReturnValue(null);
  });

  describe("GET /usage", () => {
    it("returns usage summary with empty data", async () => {
      const res = await app.fetch(makeRequest("/usage"));
      const json = (await res.json()) as {
        totalConversations: number;
        totalPromptTokens: number;
        totalCompletionTokens: number;
        totalTokens: number;
        estimatedCostUsd: number;
        models: unknown[];
      };

      expect(res.status).toBe(200);
      expect(json.totalConversations).toBe(0);
      expect(json.totalPromptTokens).toBe(0);
      expect(json.models).toEqual([]);
    });

    it("returns usage summary with model data", async () => {
      mockGetProfile.mockReturnValue({
        displayName: "GPT-4",
        cost: { input: 30, output: 60 },
      });

      let selectCallCount = 0;
      const { db } = await import("../../persistence/client.js") as { db: { select: ReturnType<typeof vi.fn> } };
      db.select.mockImplementation(() => {
        selectCallCount++;
        const chain = {
          from: vi.fn().mockReturnThis(),
          groupBy: vi.fn().mockReturnThis(),
          all: vi.fn().mockReturnValue(
            selectCallCount === 1
              ? [{ modelUsed: "gpt-4", conversationCount: 5, totalPromptTokens: 10000, totalCompletionTokens: 5000 }]
              : [],
          ),
          get: vi.fn().mockReturnValue({ count: 5 }),
        };
        return chain;
      });

      const res = await app.fetch(makeRequest("/usage"));
      const json = (await res.json()) as {
        totalConversations: number;
        totalPromptTokens: number;
        totalCompletionTokens: number;
        totalTokens: number;
        estimatedCostUsd: number;
        models: { modelId: string; displayName: string; totalTokens: number }[];
      };

      expect(res.status).toBe(200);
      expect(json.totalConversations).toBe(5);
      expect(json.totalPromptTokens).toBe(10000);
      expect(json.totalCompletionTokens).toBe(5000);
      expect(json.totalTokens).toBe(15000);
      expect(json.models).toHaveLength(1);
      expect(json.models[0].modelId).toBe("gpt-4");
      expect(json.models[0].displayName).toBe("GPT-4");
    });

    it("returns 500 on error", async () => {
      const { db } = await import("../../persistence/client.js") as { db: { select: ReturnType<typeof vi.fn> } };
      db.select.mockImplementation(() => {
        throw new Error("db error");
      });

      const res = await app.fetch(makeRequest("/usage"));
      expect(res.status).toBe(500);
    });
  });
});
