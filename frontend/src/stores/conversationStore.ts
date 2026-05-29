import { create } from "zustand";
import type { Conversation, ConversationMessage, SendMessageResponse } from "@/lib/tauri";
import * as tauri from "@/lib/tauri";

interface ConversationState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: ConversationMessage[];
  isLoading: boolean;
  isSending: boolean;
  error: string | null;

  fetchConversations: () => Promise<void>;
  createConversation: (title?: string) => Promise<Conversation>;
  selectConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  sendMessage: (content: string) => Promise<SendMessageResponse | null>;
  clearActive: () => void;
  refreshMessages: () => Promise<void>;
  setMessages: (messages: ConversationMessage[]) => void;
  setIsSending: (sending: boolean) => void;
  setConversations: (conversations: Conversation[]) => void;
}


export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  isLoading: false,
  isSending: false,
  error: null,

  fetchConversations: async () => {
    set({ isLoading: true, error: null });
    try {
      const conversations = await tauri.listConversations();
      set({ conversations, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  createConversation: async (title?: string) => {
    set({ isLoading: true, error: null });
    try {
      const conversation = await tauri.createConversation(title);
      set((state) => ({
        conversations: [conversation, ...state.conversations],
        activeConversationId: conversation.id,
        messages: [],
        isLoading: false,
      }));
      return conversation;
    } catch (error) {
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  selectConversation: async (id: string) => {
    set({ isLoading: true, error: null, activeConversationId: id });
    try {
      const { messages } = await tauri.getConversation(id);
      set({ messages, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  deleteConversation: async (id: string) => {
    try {
      await tauri.deleteConversation(id);
      set((state) => {
        const newConversations = state.conversations.filter((c) => c.id !== id);
        const newActiveId = state.activeConversationId === id ? null : state.activeConversationId;
        return {
          conversations: newConversations,
          activeConversationId: newActiveId,
          messages: newActiveId === null ? [] : state.messages,
        };
      });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  renameConversation: async (id: string, title: string) => {
    try {
      const updated = await tauri.updateConversation(id, title);
      set((state) => ({
        conversations: state.conversations.map((c) => (c.id === id ? updated : c)),
      }));
    } catch (error) {
      set({ error: String(error) });
    }
  },

  sendMessage: async (content: string) => {
    const { activeConversationId } = get();

    // Auto-create conversation if none active
    let conversationId = activeConversationId;
    if (!conversationId) {
      try {
        const conversation = await tauri.createConversation();
        conversationId = conversation.id;
        set((state) => ({
          conversations: [conversation, ...state.conversations],
          activeConversationId: conversation.id,
        }));
      } catch (error) {
        set({ error: String(error) });
        return null;
      }
    }

    // Immediately show user message (optimistic update)
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: ConversationMessage = {
      id: tempId,
      conversationId: conversationId!,
      role: "user",
      content,
      toolCalls: null,
      toolCallId: null,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({
      messages: [...state.messages, optimisticMessage],
      isSending: true,
      error: null,
    }));

    try {
      const result = await tauri.sendConversationMessage(conversationId!, content);

      // Replace temp user message with real one, add assistant message
      set((state) => ({
        messages: [
          ...state.messages.map((m) => (m.id === tempId ? result.userMessage : m)),
          result.assistantMessage,
        ],
        isSending: false,
        conversations: state.conversations.map((c) =>
          c.id === result.conversation.id ? result.conversation : c,
        ),
      }));

      return result;
    } catch (error) {
      // Remove temp message on error
      set((state) => ({
        messages: state.messages.filter((m) => m.id !== tempId),
        error: String(error),
        isSending: false,
      }));
      return null;
    }
  },

  clearActive: () => {
    set({ activeConversationId: null, messages: [] });
  },

  refreshMessages: async () => {
    const { activeConversationId } = get();
    if (!activeConversationId) return;
    try {
      const { messages } = await tauri.getConversation(activeConversationId);
      set({ messages });
    } catch (error) {
      console.error("[ConversationStore] Failed to refresh messages:", error);
    }
  },
  setMessages: (messages) => set({ messages }),
  setIsSending: (isSending) => set({ isSending }),
  setConversations: (conversations) => set({ conversations }),
}));
