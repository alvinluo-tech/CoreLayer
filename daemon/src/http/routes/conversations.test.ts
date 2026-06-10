import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  mockRunStreamTurn: vi.fn(),
  mockRunTurn: vi.fn(),
  mockGetById: vi.fn(),
  mockAddMessage: vi.fn(),
  mockList: vi.fn(),
  mockCreate: vi.fn(),
  mockDelete: vi.fn(),
  mockDeleteMany: vi.fn(),
  mockUpdate: vi.fn(),
  mockGetMessages: vi.fn(),
  mockSearchMessages: vi.fn(),
  mockGetMessageBranches: vi.fn(),
  mockGetConversationTree: vi.fn(),
  mockEditMessage: vi.fn(),
  mockDeleteMessage: vi.fn(),
}));

vi.mock("../../runtimes/agent/stream.js", () => ({
  runStreamTurn: (...args: unknown[]) => mocks.mockRunStreamTurn(...args),
}));

vi.mock("../../runtimes/agent/run.js", () => ({
  runTurn: (...args: unknown[]) => mocks.mockRunTurn(...args),
}));

vi.mock("../../persistence/factory.js", () => ({
  getRepositories: () => ({
    conversations: {
      getById: (...args: unknown[]) => mocks.mockGetById(...args),
      addMessage: (...args: unknown[]) => mocks.mockAddMessage(...args),
      list: (...args: unknown[]) => mocks.mockList(...args),
      create: (...args: unknown[]) => mocks.mockCreate(...args),
      delete: (...args: unknown[]) => mocks.mockDelete(...args),
      deleteMany: (...args: unknown[]) => mocks.mockDeleteMany(...args),
      update: (...args: unknown[]) => mocks.mockUpdate(...args),
      getMessages: (...args: unknown[]) => mocks.mockGetMessages(...args),
      searchMessages: (...args: unknown[]) => mocks.mockSearchMessages(...args),
      getMessageBranches: (...args: unknown[]) => mocks.mockGetMessageBranches(...args),
      getConversationTree: (...args: unknown[]) => mocks.mockGetConversationTree(...args),
      editMessage: (...args: unknown[]) => mocks.mockEditMessage(...args),
      deleteMessage: (...args: unknown[]) => mocks.mockDeleteMessage(...args),
    },
    agentProfiles: {
      getDefault: vi.fn().mockResolvedValue({ id: "agent-1" }),
    },
  }),
}));

vi.mock("../../runtimes/agent/application/goal-handler.js", () => ({
  isGoalCommand: vi.fn().mockReturnValue(false),
  handleGoalCommand: vi.fn(),
  GoalJudge: vi.fn().mockImplementation(() => ({
    checkAfterTurn: vi.fn().mockResolvedValue({ needsContinuation: false }),
  })),
}));

vi.mock("../../shared/errors.js", () => ({
  apiError: vi.fn((_c: unknown, message: string, status: number) => {
    return new Response(JSON.stringify({ error: message }), { status });
  }),
  extractErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  logError: vi.fn(),
}));

import app from "./conversations.js";

function makeRequest(path: string, method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`http://localhost${path}`, init);
}

describe("conversations API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetById.mockResolvedValue({ id: "conv-1", title: "Test", createdAt: "2024-01-01", modelUsed: "claude" });
    mocks.mockAddMessage.mockResolvedValue({ id: "msg-1", role: "user", content: "hi" });
    mocks.mockList.mockResolvedValue([]);
    mocks.mockCreate.mockResolvedValue({ id: "conv-new", title: "New" });
    mocks.mockDelete.mockResolvedValue(true);
    mocks.mockDeleteMany.mockResolvedValue(2);
    mocks.mockUpdate.mockResolvedValue({ id: "conv-1", title: "Updated" });
    mocks.mockGetMessages.mockResolvedValue([]);
    mocks.mockSearchMessages.mockResolvedValue([]);
    mocks.mockGetMessageBranches.mockResolvedValue([]);
    mocks.mockGetConversationTree.mockResolvedValue([]);
    mocks.mockEditMessage.mockResolvedValue({ id: "msg-1", content: "edited" });
    mocks.mockDeleteMessage.mockResolvedValue(true);
  });

  // ── GET / ──
  describe("GET /", () => {
    it("returns list of conversations", async () => {
      mocks.mockList.mockResolvedValue([{ id: "c1", title: "Hi" }]);
      const res = await app.fetch(makeRequest("/"));
      const json = (await res.json()) as { conversations: unknown[] };
      expect(res.status).toBe(200);
      expect(json.conversations).toHaveLength(1);
    });

    it("returns 500 on error", async () => {
      mocks.mockList.mockRejectedValue(new Error("db fail"));
      const res = await app.fetch(makeRequest("/"));
      expect(res.status).toBe(500);
    });
  });

  // ── POST / ──
  describe("POST /", () => {
    it("creates conversation with title", async () => {
      const res = await app.fetch(makeRequest("/", "POST", { title: "My Chat" }));
      const json = (await res.json()) as { conversation: { id: string } };
      expect(res.status).toBe(201);
      expect(json.conversation.id).toBe("conv-new");
    });

    it("creates conversation without title", async () => {
      const res = await app.fetch(makeRequest("/", "POST", {}));
      expect(res.status).toBe(201);
    });

    it("returns 500 on error", async () => {
      mocks.mockCreate.mockRejectedValue(new Error("fail"));
      const res = await app.fetch(makeRequest("/", "POST", { title: "x" }));
      expect(res.status).toBe(500);
    });
  });

  // ── GET /:id ──
  describe("GET /:id", () => {
    it("returns conversation with messages", async () => {
      mocks.mockGetMessages.mockResolvedValue([{ id: "m1", role: "user", content: "hello" }]);
      const res = await app.fetch(makeRequest("/conv-1"));
      const json = (await res.json()) as { conversation: { id: string }; messages: unknown[] };
      expect(res.status).toBe(200);
      expect(json.conversation.id).toBe("conv-1");
      expect(json.messages).toHaveLength(1);
    });

    it("returns 404 if not found", async () => {
      mocks.mockGetById.mockResolvedValue(null);
      const res = await app.fetch(makeRequest("/missing"));
      expect(res.status).toBe(404);
    });

    it("returns 500 on error", async () => {
      mocks.mockGetById.mockRejectedValue(new Error("db"));
      const res = await app.fetch(makeRequest("/conv-1"));
      expect(res.status).toBe(500);
    });
  });

  // ── POST /batch-delete ──
  describe("POST /batch-delete", () => {
    it("deletes multiple conversations", async () => {
      const res = await app.fetch(makeRequest("/batch-delete", "POST", { ids: ["a", "b"] }));
      const json = (await res.json()) as { deleted: number };
      expect(res.status).toBe(200);
      expect(json.deleted).toBe(2);
    });

    it("returns 0 when ids empty", async () => {
      const res = await app.fetch(makeRequest("/batch-delete", "POST", { ids: [] }));
      const json = (await res.json()) as { deleted: number };
      expect(json.deleted).toBe(0);
    });

    it("returns 0 when ids missing", async () => {
      const res = await app.fetch(makeRequest("/batch-delete", "POST", {}));
      const json = (await res.json()) as { deleted: number };
      expect(json.deleted).toBe(0);
    });

    it("returns 500 on error", async () => {
      mocks.mockDeleteMany.mockRejectedValue(new Error("fail"));
      const res = await app.fetch(makeRequest("/batch-delete", "POST", { ids: ["a"] }));
      expect(res.status).toBe(500);
    });
  });

  // ── DELETE /:id ──
  describe("DELETE /:id", () => {
    it("deletes conversation", async () => {
      const res = await app.fetch(makeRequest("/conv-1", "DELETE"));
      const json = (await res.json()) as { success: boolean };
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("returns 404 if not found", async () => {
      mocks.mockDelete.mockResolvedValue(false);
      const res = await app.fetch(makeRequest("/missing", "DELETE"));
      expect(res.status).toBe(404);
    });

    it("returns 500 on error", async () => {
      mocks.mockDelete.mockRejectedValue(new Error("fail"));
      const res = await app.fetch(makeRequest("/conv-1", "DELETE"));
      expect(res.status).toBe(500);
    });
  });

  // ── PATCH /:id ──
  describe("PATCH /:id", () => {
    it("updates conversation title", async () => {
      const res = await app.fetch(makeRequest("/conv-1", "PATCH", { title: "New Title" }));
      const json = (await res.json()) as { conversation: { title: string } };
      expect(res.status).toBe(200);
      expect(json.conversation.title).toBe("Updated");
    });

    it("returns 404 if not found", async () => {
      mocks.mockUpdate.mockResolvedValue(null);
      const res = await app.fetch(makeRequest("/missing", "PATCH", { title: "x" }));
      expect(res.status).toBe(404);
    });

    it("returns 500 on error", async () => {
      mocks.mockUpdate.mockRejectedValue(new Error("fail"));
      const res = await app.fetch(makeRequest("/conv-1", "PATCH", { title: "x" }));
      expect(res.status).toBe(500);
    });
  });

  // ── POST /:id/messages ──
  describe("POST /:id/messages", () => {
    it("calls runTurn and returns result", async () => {
      mocks.mockRunTurn.mockResolvedValue({
        userMessage: { id: "u1" },
        assistantMessage: { id: "a1" },
        conversation: { id: "conv-1" },
      });
      const res = await app.fetch(makeRequest("/conv-1/messages", "POST", { content: "hello" }));
      expect(res.status).toBe(200);
      expect(mocks.mockRunTurn).toHaveBeenCalled();
    });

    it("returns 404 if conversation not found", async () => {
      mocks.mockGetById.mockResolvedValue(null);
      const res = await app.fetch(makeRequest("/missing/messages", "POST", { content: "hi" }));
      expect(res.status).toBe(404);
    });

    it("returns 400 for empty content", async () => {
      const res = await app.fetch(makeRequest("/conv-1/messages", "POST", { content: "" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for whitespace-only content", async () => {
      const res = await app.fetch(makeRequest("/conv-1/messages", "POST", { content: "   " }));
      expect(res.status).toBe(400);
    });

    it("returns 500 when runTurn throws", async () => {
      mocks.mockRunTurn.mockRejectedValue(new Error("llm fail"));
      const res = await app.fetch(makeRequest("/conv-1/messages", "POST", { content: "hi" }));
      expect(res.status).toBe(500);
    });
  });

  // ── POST /:id/messages/stream ──
  describe("POST /:id/messages/stream", () => {
    it("returns 404 if conversation not found", async () => {
      mocks.mockGetById.mockResolvedValue(null);
      const res = await app.fetch(makeRequest("/missing/messages/stream", "POST", { content: "hi" }));
      expect(res.status).toBe(404);
    });

    it("returns 400 for empty content", async () => {
      const res = await app.fetch(makeRequest("/conv-1/messages/stream", "POST", { content: "" }));
      expect(res.status).toBe(400);
    });

    it("streams delta and done events", async () => {
      const mockStream = (async function* () {
        yield { type: "delta" as const, text: "hi" };
        yield {
          type: "run_completed" as const,
          result: {
            userMessage: { id: "u1" },
            assistantMessage: { id: "a1" },
            conversation: { id: "conv-1" },
          },
        };
      })();

      mocks.mockRunStreamTurn.mockResolvedValue({ runId: "r1", stream: mockStream });
      const res = await app.fetch(makeRequest("/conv-1/messages/stream", "POST", { content: "hi" }));
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("delta");
      expect(text).toContain("done");
    });

    it("streams error on run_failed", async () => {
      const mockStream = (async function* () {
        yield { type: "run_failed" as const, error: "boom" };
      })();

      mocks.mockRunStreamTurn.mockResolvedValue({ runId: "r1", stream: mockStream });
      const res = await app.fetch(makeRequest("/conv-1/messages/stream", "POST", { content: "hi" }));
      const text = await res.text();
      expect(text).toContain("error");
      expect(text).toContain("boom");
    });

    it("streams tool_call events with result", async () => {
      const mockStream = (async function* () {
        yield {
          type: "tool_call" as const,
          toolCall: { id: "tc1", name: "web_search", result: { data: "ok" } },
        };
        yield {
          type: "run_completed" as const,
          result: { userMessage: {}, assistantMessage: {}, conversation: {} },
        };
      })();

      mocks.mockRunStreamTurn.mockResolvedValue({ runId: "r1", stream: mockStream });
      const res = await app.fetch(makeRequest("/conv-1/messages/stream", "POST", { content: "search" }));
      const text = await res.text();
      expect(text).toContain("tool_result");
    });

    it("streams tool_call events without result (pending)", async () => {
      const mockStream = (async function* () {
        yield {
          type: "tool_call" as const,
          toolCall: { id: "tc2", name: "approve_me", args: { path: "/tmp" } },
        };
        yield {
          type: "run_completed" as const,
          result: { userMessage: {}, assistantMessage: {}, conversation: {} },
        };
      })();

      mocks.mockRunStreamTurn.mockResolvedValue({ runId: "r1", stream: mockStream });
      const res = await app.fetch(makeRequest("/conv-1/messages/stream", "POST", { content: "do it" }));
      const text = await res.text();
      expect(text).toContain("tool_calls");
    });

    it("returns 500 when stream setup throws", async () => {
      mocks.mockRunStreamTurn.mockRejectedValue(new Error("stream init fail"));
      const res = await app.fetch(makeRequest("/conv-1/messages/stream", "POST", { content: "hi" }));
      expect(res.status).toBe(500);
    });
  });

  // ── PUT /:id/messages/:msgId ──
  describe("PUT /:id/messages/:msgId", () => {
    it("edits a user message", async () => {
      mocks.mockGetMessages.mockResolvedValue([
        { id: "m1", role: "user", content: "old" },
      ]);
      const res = await app.fetch(makeRequest("/conv-1/messages/m1", "PUT", { content: "new" }));
      const json = (await res.json()) as { message: { content: string } };
      expect(res.status).toBe(200);
      expect(json.message.content).toBe("edited");
    });

    it("returns 400 for empty content", async () => {
      const res = await app.fetch(makeRequest("/conv-1/messages/m1", "PUT", { content: "" }));
      expect(res.status).toBe(400);
    });

    it("returns 404 if conversation not found", async () => {
      mocks.mockGetById.mockResolvedValue(null);
      const res = await app.fetch(makeRequest("/missing/messages/m1", "PUT", { content: "x" }));
      expect(res.status).toBe(404);
    });

    it("returns 404 if message not found", async () => {
      mocks.mockGetMessages.mockResolvedValue([]);
      const res = await app.fetch(makeRequest("/conv-1/messages/nope", "PUT", { content: "x" }));
      expect(res.status).toBe(404);
    });

    it("returns 400 if message is not a user message", async () => {
      mocks.mockGetMessages.mockResolvedValue([
        { id: "m1", role: "assistant", content: "bot" },
      ]);
      const res = await app.fetch(makeRequest("/conv-1/messages/m1", "PUT", { content: "x" }));
      expect(res.status).toBe(400);
    });

    it("returns 500 on error", async () => {
      mocks.mockGetById.mockRejectedValue(new Error("db"));
      const res = await app.fetch(makeRequest("/conv-1/messages/m1", "PUT", { content: "x" }));
      expect(res.status).toBe(500);
    });
  });

  // ── POST /:id/messages/:msgId/regenerate ──
  describe("POST /:id/messages/:msgId/regenerate", () => {
    it("regenerates assistant response", async () => {
      mocks.mockGetMessages.mockResolvedValue([
        { id: "m1", role: "user", content: "hi" },
        { id: "m2", role: "assistant", content: "old reply" },
      ]);
      mocks.mockRunTurn.mockResolvedValue({
        assistantMessage: { id: "a1", content: "new reply" },
        conversation: { id: "conv-1" },
      });
      const res = await app.fetch(makeRequest("/conv-1/messages/m1/regenerate", "POST"));
      expect(res.status).toBe(200);
      expect(mocks.mockDeleteMessage).toHaveBeenCalledWith("m2");
      expect(mocks.mockRunTurn).toHaveBeenCalled();
    });

    it("regenerates without deleting if no next assistant msg", async () => {
      mocks.mockGetMessages.mockResolvedValue([
        { id: "m1", role: "user", content: "hi" },
      ]);
      mocks.mockRunTurn.mockResolvedValue({
        assistantMessage: { id: "a1" },
        conversation: { id: "conv-1" },
      });
      const res = await app.fetch(makeRequest("/conv-1/messages/m1/regenerate", "POST"));
      expect(res.status).toBe(200);
      expect(mocks.mockDeleteMessage).not.toHaveBeenCalled();
    });

    it("returns 404 if conversation not found", async () => {
      mocks.mockGetById.mockResolvedValue(null);
      const res = await app.fetch(makeRequest("/missing/messages/m1/regenerate", "POST"));
      expect(res.status).toBe(404);
    });

    it("returns 404 if message not found", async () => {
      mocks.mockGetMessages.mockResolvedValue([]);
      const res = await app.fetch(makeRequest("/conv-1/messages/nope/regenerate", "POST"));
      expect(res.status).toBe(404);
    });

    it("returns 400 if message is not a user message", async () => {
      mocks.mockGetMessages.mockResolvedValue([
        { id: "m1", role: "assistant", content: "bot" },
      ]);
      const res = await app.fetch(makeRequest("/conv-1/messages/m1/regenerate", "POST"));
      expect(res.status).toBe(400);
    });

    it("returns 500 when runTurn throws", async () => {
      mocks.mockGetMessages.mockResolvedValue([
        { id: "m1", role: "user", content: "hi" },
      ]);
      mocks.mockRunTurn.mockRejectedValue(new Error("llm fail"));
      const res = await app.fetch(makeRequest("/conv-1/messages/m1/regenerate", "POST"));
      expect(res.status).toBe(500);
    });
  });

  // ── GET /:id/messages/:msgId/branches ──
  describe("GET /:id/messages/:msgId/branches", () => {
    it("returns branches with currentIndex", async () => {
      mocks.mockGetMessageBranches.mockResolvedValue([
        { id: "m1", content: "a" },
        { id: "m2", content: "b" },
      ]);
      const res = await app.fetch(makeRequest("/conv-1/messages/m2/branches"));
      const json = (await res.json()) as { branches: unknown[]; currentIndex: number; total: number };
      expect(res.status).toBe(200);
      expect(json.branches).toHaveLength(2);
      expect(json.currentIndex).toBe(1);
      expect(json.total).toBe(2);
    });

    it("returns 404 if conversation not found", async () => {
      mocks.mockGetById.mockResolvedValue(null);
      const res = await app.fetch(makeRequest("/missing/messages/m1/branches"));
      expect(res.status).toBe(404);
    });

    it("returns 500 on error", async () => {
      mocks.mockGetById.mockRejectedValue(new Error("db"));
      const res = await app.fetch(makeRequest("/conv-1/messages/m1/branches"));
      expect(res.status).toBe(500);
    });
  });

  // ── GET /:id/tree ──
  describe("GET /:id/tree", () => {
    it("returns conversation tree", async () => {
      mocks.mockGetConversationTree.mockResolvedValue([{ id: "m1", children: [] }]);
      const res = await app.fetch(makeRequest("/conv-1/tree"));
      const json = (await res.json()) as { tree: unknown[] };
      expect(res.status).toBe(200);
      expect(json.tree).toHaveLength(1);
    });

    it("returns 404 if conversation not found", async () => {
      mocks.mockGetById.mockResolvedValue(null);
      const res = await app.fetch(makeRequest("/missing/tree"));
      expect(res.status).toBe(404);
    });

    it("returns 500 on error", async () => {
      mocks.mockGetById.mockRejectedValue(new Error("db"));
      const res = await app.fetch(makeRequest("/conv-1/tree"));
      expect(res.status).toBe(500);
    });
  });

  // ── GET /messages/search ──
  describe("GET /messages/search", () => {
    it("searches messages with query", async () => {
      mocks.mockSearchMessages.mockResolvedValue([{ id: "m1", content: "found it" }]);
      const res = await app.fetch(makeRequest("/messages/search?q=found&limit=10"));
      const json = (await res.json()) as { results: unknown[] };
      expect(res.status).toBe(200);
      expect(json.results).toHaveLength(1);
    });

    it("returns 400 for empty query", async () => {
      const res = await app.fetch(makeRequest("/messages/search?q="));
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing query", async () => {
      const res = await app.fetch(makeRequest("/messages/search"));
      expect(res.status).toBe(400);
    });

    it("returns 500 on error", async () => {
      mocks.mockSearchMessages.mockRejectedValue(new Error("db"));
      const res = await app.fetch(makeRequest("/messages/search?q=test"));
      expect(res.status).toBe(500);
    });
  });

  // ── GET /:id/export ──
  describe("GET /:id/export", () => {
    it("exports as markdown by default", async () => {
      mocks.mockGetMessages.mockResolvedValue([
        { id: "m1", role: "user", content: "hello" },
        { id: "m2", role: "assistant", content: "hi there" },
      ]);
      const res = await app.fetch(makeRequest("/conv-1/export"));
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("# Test");
      expect(text).toContain("## User");
      expect(text).toContain("## Assistant");
      expect(text).toContain("hello");
    });

    it("exports as json", async () => {
      mocks.mockGetMessages.mockResolvedValue([
        { id: "m1", role: "user", content: "hello", toolCalls: null, createdAt: "2024-01-01" },
      ]);
      const res = await app.fetch(makeRequest("/conv-1/export?format=json"));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { id: string; messages: unknown[] };
      expect(json.id).toBe("conv-1");
      expect(json.messages).toHaveLength(1);
    });

    it("exports markdown with tool calls", async () => {
      mocks.mockGetMessages.mockResolvedValue([
        { id: "m1", role: "assistant", content: "done", toolCalls: JSON.stringify([{ name: "web_search", result: { ok: true } }]) },
      ]);
      const res = await app.fetch(makeRequest("/conv-1/export"));
      const text = await res.text();
      expect(text).toContain("### Tool: web_search");
    });

    it("exports json with toolCalls parsed", async () => {
      mocks.mockGetMessages.mockResolvedValue([
        { id: "m1", role: "assistant", content: "done", toolCalls: JSON.stringify([{ name: "x" }]), createdAt: "2024-01-01" },
      ]);
      const res = await app.fetch(makeRequest("/conv-1/export?format=json"));
      const json = (await res.json()) as { messages: { toolCalls: unknown }[] };
      expect(json.messages[0].toolCalls).toEqual([{ name: "x" }]);
    });

    it("returns 404 if conversation not found", async () => {
      mocks.mockGetById.mockResolvedValue(null);
      const res = await app.fetch(makeRequest("/missing/export"));
      expect(res.status).toBe(404);
    });

    it("returns 500 on error", async () => {
      mocks.mockGetById.mockRejectedValue(new Error("db"));
      const res = await app.fetch(makeRequest("/conv-1/export"));
      expect(res.status).toBe(500);
    });
  });
});
