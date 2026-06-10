import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockRunTurn, mockRunStreamTurn, mockGetAll, mockGetMessages, mockGetActiveModel } = vi.hoisted(() => ({
  mockRunTurn: vi.fn(),
  mockRunStreamTurn: vi.fn(),
  mockGetAll: vi.fn(),
  mockGetMessages: vi.fn(),
  mockGetActiveModel: vi.fn(),
}));

vi.mock("../../runtimes/agent/public-api.js", () => ({
  ContextBuilder: vi.fn().mockImplementation(() => ({
    build: vi.fn().mockResolvedValue({
      debug: () => ({ tokens: 100, components: [] }),
    }),
  })),
  runTurn: (...args: unknown[]) => mockRunTurn(...args),
  runStreamTurn: (...args: unknown[]) => mockRunStreamTurn(...args),
}));

vi.mock("../../persistence/factory.js", () => ({
  getRepositories: () => ({
    memories: {
      getAll: (...args: unknown[]) => mockGetAll(...args),
    },
    conversations: {
      getMessages: (...args: unknown[]) => mockGetMessages(...args),
    },
  }),
}));

vi.mock("../../config/config-manager.js", () => ({
  configManager: {
    getActiveModel: (...args: unknown[]) => mockGetActiveModel(...args),
  },
}));

vi.mock("../../shared/errors.js", () => ({
  apiError: vi.fn((_c: unknown, message: string, status = 500) =>
    new Response(JSON.stringify({ error: message }), { status }),
  ),
  extractErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  classifyError: vi.fn(() => ({ status: 500 as const, code: "AI_ERROR", retryable: false })),
  logError: vi.fn(),
}));

import app from "./chat.js";

function makeRequest(path: string, method = "POST", body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`http://localhost${path}`, init);
}

describe("chat route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([]);
    mockGetMessages.mockResolvedValue([]);
    mockGetActiveModel.mockReturnValue("mimo-v2.5-pro");
  });

  describe("POST /", () => {
    it("returns reply for valid message", async () => {
      mockRunTurn.mockResolvedValue({
        runId: "run-1",
        conversationId: "conv-1",
        text: "Hello!",
        events: [],
      });

      const res = await app.fetch(makeRequest("/", "POST", { message: "Hi" }));
      const json = (await res.json()) as { reply: string; runId: string };

      expect(res.status).toBe(200);
      expect(json.reply).toBe("Hello!");
      expect(json.runId).toBe("run-1");
    });

    it("returns 400 when message is empty", async () => {
      const res = await app.fetch(makeRequest("/", "POST", { message: "" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when message is whitespace only", async () => {
      const res = await app.fetch(makeRequest("/", "POST", { message: "   " }));
      expect(res.status).toBe(400);
    });

    it("passes context params to runTurn", async () => {
      mockRunTurn.mockResolvedValue({ runId: "r1", conversationId: "c1", text: "", events: [] });

      await app.fetch(
        makeRequest("/", "POST", {
          message: "test",
          conversationId: "c1",
          workspaceId: "ws1",
          projectId: "p1",
          agentId: "a1",
          modelOverride: "gpt-4",
        }),
      );

      expect(mockRunTurn).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "c1",
          workspaceId: "ws1",
          projectId: "p1",
          agentId: "a1",
          input: "test",
          mode: "chat",
          modelOverride: "gpt-4",
        }),
      );
    });
  });

  describe("POST /stream", () => {
    it("streams delta and done events", async () => {
      const mockStream = (async function* () {
        yield { type: "delta" as const, text: "Hello" };
        yield {
          type: "run_completed" as const,
          result: { text: "Hello!", conversationId: "conv-1" },
        };
      })();

      mockRunStreamTurn.mockResolvedValue({
        runId: "run-1",
        stream: mockStream,
        abortController: new AbortController(),
      });

      const res = await app.fetch(makeRequest("/stream", "POST", { message: "Hi" }));
      expect(res.status).toBe(200);

      const text = await res.text();
      expect(text).toContain("delta");
      expect(text).toContain("Hello");
      expect(text).toContain("done");
    });

    it("returns 400 when message is empty", async () => {
      const res = await app.fetch(makeRequest("/stream", "POST", { message: "" }));
      expect(res.status).toBe(400);
    });

    it("emits error event on run_failed", async () => {
      const mockStream = (async function* () {
        yield { type: "run_failed" as const, error: "model unavailable" };
      })();

      mockRunStreamTurn.mockResolvedValue({
        runId: "run-1",
        stream: mockStream,
        abortController: new AbortController(),
      });

      const res = await app.fetch(makeRequest("/stream", "POST", { message: "Hi" }));
      const text = await res.text();
      expect(text).toContain("error");
      expect(text).toContain("model unavailable");
    });
  });

  describe("POST /debug/context", () => {
    it("returns debug context info", async () => {
      mockGetAll.mockResolvedValue([{ id: "m1", key: "test" }]);
      mockGetMessages.mockResolvedValue([]);

      const res = await app.fetch(
        makeRequest("/debug/context", "POST", { conversationId: "c1", message: "test" }),
      );
      const json = (await res.json()) as { tokens: number };

      expect(res.status).toBe(200);
      expect(json.tokens).toBe(100);
    });

    it("works without conversationId", async () => {
      mockGetAll.mockResolvedValue([]);

      const res = await app.fetch(
        makeRequest("/debug/context", "POST", { message: "test" }),
      );
      expect(res.status).toBe(200);
      expect(mockGetMessages).not.toHaveBeenCalled();
    });
  });
});
