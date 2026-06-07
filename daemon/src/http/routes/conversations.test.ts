import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRunStreamTurn, mockRunTurn, mockGetById, mockAddMessage, mockList, mockCreate, mockDelete, mockUpdate, mockGetMessages, mockSearchMessages, mockGetMessageBranches, mockGetConversationTree, mockEditMessage, mockDeleteMessage } = vi.hoisted(() => ({
  mockRunStreamTurn: vi.fn(),
  mockRunTurn: vi.fn(),
  mockGetById: vi.fn(),
  mockAddMessage: vi.fn(),
  mockList: vi.fn(),
  mockCreate: vi.fn(),
  mockDelete: vi.fn(),
  mockUpdate: vi.fn(),
  mockGetMessages: vi.fn(),
  mockSearchMessages: vi.fn(),
  mockGetMessageBranches: vi.fn(),
  mockGetConversationTree: vi.fn(),
  mockEditMessage: vi.fn(),
  mockDeleteMessage: vi.fn(),
}));

vi.mock("../../runtimes/agent/stream.js", () => ({
  runStreamTurn: (...args: unknown[]) => mockRunStreamTurn(...args),
}));

vi.mock("../../runtimes/agent/run.js", () => ({
  runTurn: (...args: unknown[]) => mockRunTurn(...args),
}));

vi.mock("../../persistence/factory.js", () => ({
  getRepositories: () => ({
    conversations: {
      getById: (...args: unknown[]) => mockGetById(...args),
      addMessage: (...args: unknown[]) => mockAddMessage(...args),
      list: (...args: unknown[]) => mockList(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      getMessages: (...args: unknown[]) => mockGetMessages(...args),
      searchMessages: (...args: unknown[]) => mockSearchMessages(...args),
      getMessageBranches: (...args: unknown[]) => mockGetMessageBranches(...args),
      getConversationTree: (...args: unknown[]) => mockGetConversationTree(...args),
      editMessage: (...args: unknown[]) => mockEditMessage(...args),
      deleteMessage: (...args: unknown[]) => mockDeleteMessage(...args),
    },
    workspaces: {
      getDefault: vi.fn().mockResolvedValue({ id: "ws-1" }),
      create: vi.fn().mockResolvedValue({ id: "ws-1" }),
    },
    agentProfiles: {
      getDefault: vi.fn().mockResolvedValue({ id: "agent-1" }),
      create: vi.fn().mockResolvedValue({ id: "agent-1" }),
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
  extractErrorMessage: vi.fn((err: unknown) => err instanceof Error ? err.message : String(err)),
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
    mockGetById.mockResolvedValue({ id: "conv-1", title: "Test" });
    mockAddMessage.mockResolvedValue({ id: "msg-1", role: "user", content: "hi" });
    mockList.mockResolvedValue([]);
    mockCreate.mockResolvedValue({ id: "conv-new", title: "New" });
    mockDelete.mockResolvedValue(true);
    mockUpdate.mockResolvedValue({ id: "conv-1", title: "Updated" });
    mockGetMessages.mockResolvedValue([]);
    mockSearchMessages.mockResolvedValue([]);
    mockGetMessageBranches.mockResolvedValue([]);
    mockGetConversationTree.mockResolvedValue([]);
    mockEditMessage.mockResolvedValue({ id: "msg-1", content: "edited" });
    mockDeleteMessage.mockResolvedValue(true);
  });

  describe("POST /:id/messages (non-streaming)", () => {
    it("calls runTurn with conversationId and input", async () => {
      mockRunTurn.mockResolvedValue({
        runId: "run-1",
        conversationId: "conv-1",
        text: "hello",
        events: [],
        userMessage: { id: "u1", role: "user", content: "hi" },
        assistantMessage: { id: "a1", role: "assistant", content: "hello" },
        conversation: { id: "conv-1", title: "Test" },
      });

      const res = await app.fetch(makeRequest("/conv-1/messages", "POST", { content: "hi" }));
      const json = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(mockRunTurn).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: "conv-1", input: "hi", mode: "chat" }),
      );
      expect(json.userMessage).toBeDefined();
      expect(json.assistantMessage).toBeDefined();
      expect(json.conversation).toBeDefined();
    });
  });

  describe("POST /:id/messages/stream", () => {
    it("calls runStreamTurn and emits delta + done events", async () => {
      const mockStream = (async function* () {
        yield { type: "delta" as const, text: "hello" };
        yield {
          type: "run_completed" as const,
          result: {
            text: "hello",
            conversationId: "conv-1",
            userMessage: { id: "u1" },
            assistantMessage: { id: "a1" },
            conversation: { id: "conv-1" },
          },
        };
      })();

      mockRunStreamTurn.mockResolvedValue({
        runId: "run-1",
        conversationId: "conv-1",
        stream: mockStream,
        abortController: new AbortController(),
      });

      const res = await app.fetch(makeRequest("/conv-1/messages/stream", "POST", { content: "hi" }));
      expect(res.status).toBe(200);
      expect(mockRunStreamTurn).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: "conv-1", input: "hi", mode: "chat" }),
        expect.anything(),
      );

      const text = await res.text();
      expect(text).toContain("delta");
      expect(text).toContain("hello");
      expect(text).toContain("done");
    });

    it("emits error on run_failed", async () => {
      const mockStream = (async function* () {
        yield { type: "run_failed" as const, error: "something broke" };
      })();

      mockRunStreamTurn.mockResolvedValue({
        runId: "run-1",
        conversationId: "conv-1",
        stream: mockStream,
        abortController: new AbortController(),
      });

      const res = await app.fetch(makeRequest("/conv-1/messages/stream", "POST", { content: "hi" }));
      const text = await res.text();
      expect(text).toContain("error");
      expect(text).toContain("something broke");
    });
  });
});
