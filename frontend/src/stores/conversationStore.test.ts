import { describe, it, expect, beforeEach, vi } from "vitest";

const mockInvoke = vi.fn();
vi.mock("@/lib/tauri", () => ({
  listConversations: (...args: unknown[]) => mockInvoke("listConversations", ...args),
  createConversation: (...args: unknown[]) => mockInvoke("createConversation", ...args),
  getConversation: (...args: unknown[]) => mockInvoke("getConversation", ...args),
  deleteConversation: (...args: unknown[]) => mockInvoke("deleteConversation", ...args),
  updateConversation: (...args: unknown[]) => mockInvoke("updateConversation", ...args),
  sendConversationMessage: (...args: unknown[]) => mockInvoke("sendConversationMessage", ...args),
}));

import { useConversationStore } from "./conversationStore";

const baseConversation = {
  id: "conv-1",
  title: "Test conversation",
  modelUsed: "gpt-4",
  messageCount: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  mockInvoke.mockReset();
  useConversationStore.setState({
    conversations: [],
    activeConversationId: null,
    messages: [],
    isLoading: false,
    isSending: false,
    error: null,
  });
});

describe("useConversationStore", () => {
  describe("fetchConversations", () => {
    it("populates conversations on success", async () => {
      mockInvoke.mockResolvedValueOnce([baseConversation]);

      await useConversationStore.getState().fetchConversations();

      const state = useConversationStore.getState();
      expect(state.conversations).toEqual([baseConversation]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it("sets error on failure", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("fetch failed"));

      await useConversationStore.getState().fetchConversations();

      const state = useConversationStore.getState();
      expect(state.conversations).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe("Error: fetch failed");
    });
  });

  describe("sendMessage", () => {
    it("performs optimistic update and replaces with real messages on success", async () => {
      useConversationStore.setState({
        conversations: [baseConversation],
        activeConversationId: "conv-1",
        messages: [],
      });

      const userMessage = {
        id: "msg-1",
        conversationId: "conv-1",
        role: "user" as const,
        content: "Hello",
        toolCalls: null,
        toolCallId: null,
        createdAt: "2026-01-01T00:00:01Z",
      };
      const assistantMessage = {
        id: "msg-2",
        conversationId: "conv-1",
        role: "assistant" as const,
        content: "Hi there",
        toolCalls: null,
        toolCallId: null,
        createdAt: "2026-01-01T00:00:02Z",
      };
      const updatedConv = { ...baseConversation, messageCount: 2 };

      mockInvoke.mockResolvedValueOnce({
        userMessage,
        assistantMessage,
        conversation: updatedConv,
      });

      await useConversationStore.getState().sendMessage("Hello");

      const state = useConversationStore.getState();
      expect(state.messages).toHaveLength(2);
      expect(state.messages[0]!.id).toBe("msg-1");
      expect(state.messages[1]!.id).toBe("msg-2");
      expect(state.isSending).toBe(false);
    });

    it("rolls back optimistic message on failure", async () => {
      useConversationStore.setState({
        conversations: [baseConversation],
        activeConversationId: "conv-1",
        messages: [],
      });

      mockInvoke.mockRejectedValueOnce(new Error("send failed"));

      const result = await useConversationStore.getState().sendMessage("Hello");

      expect(result).toBeNull();
      const state = useConversationStore.getState();
      expect(state.messages).toEqual([]);
      expect(state.isSending).toBe(false);
      expect(state.error).toBe("Error: send failed");
    });

    it("auto-creates conversation when none is active", async () => {
      useConversationStore.setState({
        conversations: [],
        activeConversationId: null,
        messages: [],
      });

      const newConv = { ...baseConversation, id: "conv-new" };
      const userMessage = {
        id: "msg-1",
        conversationId: "conv-new",
        role: "user" as const,
        content: "Hello",
        toolCalls: null,
        toolCallId: null,
        createdAt: "2026-01-01T00:00:01Z",
      };
      const assistantMessage = {
        id: "msg-2",
        conversationId: "conv-new",
        role: "assistant" as const,
        content: "Hi",
        toolCalls: null,
        toolCallId: null,
        createdAt: "2026-01-01T00:00:02Z",
      };

      // First call: createConversation
      mockInvoke.mockResolvedValueOnce(newConv);
      // Second call: sendConversationMessage
      mockInvoke.mockResolvedValueOnce({
        userMessage,
        assistantMessage,
        conversation: newConv,
      });

      await useConversationStore.getState().sendMessage("Hello");

      const state = useConversationStore.getState();
      expect(state.activeConversationId).toBe("conv-new");
      expect(state.conversations).toContainEqual(newConv);
    });
  });

  describe("deleteConversation", () => {
    it("removes conversation from list on success", async () => {
      useConversationStore.setState({
        conversations: [baseConversation],
        activeConversationId: null,
      });
      mockInvoke.mockResolvedValueOnce(undefined);

      await useConversationStore.getState().deleteConversation("conv-1");

      expect(useConversationStore.getState().conversations).toEqual([]);
    });

    it("clears activeConversationId if deleted conversation was active", async () => {
      useConversationStore.setState({
        conversations: [baseConversation],
        activeConversationId: "conv-1",
        messages: [{ id: "m1", conversationId: "conv-1", role: "user", content: "hi", toolCalls: null, toolCallId: null, createdAt: "" }],
      });
      mockInvoke.mockResolvedValueOnce(undefined);

      await useConversationStore.getState().deleteConversation("conv-1");

      const state = useConversationStore.getState();
      expect(state.activeConversationId).toBeNull();
      expect(state.messages).toEqual([]);
    });

    it("keeps activeConversationId if deleted conversation was not active", async () => {
      useConversationStore.setState({
        conversations: [baseConversation, { ...baseConversation, id: "conv-2" }],
        activeConversationId: "conv-2",
      });
      mockInvoke.mockResolvedValueOnce(undefined);

      await useConversationStore.getState().deleteConversation("conv-1");

      expect(useConversationStore.getState().activeConversationId).toBe("conv-2");
    });
  });
});
