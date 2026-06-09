import { create } from 'zustand';
import type { Conversation, ConversationMessage, SendMessageResponse } from '@/lib/tauri';
import * as tauri from '@/lib/tauri';

let selectConversationRequestSeq = 0;

interface ConversationState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: ConversationMessage[];
  isLoading: boolean;
  isSending: boolean;
  error: string | null;

  fetchConversations: () => Promise<void>;
  createConversation: (title?: string) => Promise<Conversation>;
  getOrCreateDefaultConversation: () => Promise<Conversation>;
  selectConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  deleteConversations: (ids: string[]) => Promise<void>;
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
      set((state) => {
        const activeExists = conversations.some((c) => c.id === state.activeConversationId);
        return {
          conversations,
          isLoading: false,
          activeConversationId: activeExists ? state.activeConversationId : null,
          messages: activeExists ? state.messages : [],
        };
      });
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

  getOrCreateDefaultConversation: async () => {
    const { conversations } = get();
    const defaultConv = conversations.find((c) => c.title === '默认对话');
    if (defaultConv) {
      set({ activeConversationId: defaultConv.id });
      try {
        const { messages } = await tauri.getConversation(defaultConv.id);
        set({ messages });
      } catch {
        // Message fetch failure is non-critical; conversation list is already loaded
      }
      return defaultConv;
    }

    try {
      const conversation = await tauri.createConversation('默认对话');
      set((state) => ({
        conversations: [conversation, ...state.conversations],
        activeConversationId: conversation.id,
        messages: [],
      }));
      return conversation;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  selectConversation: async (id: string) => {
    const requestSeq = ++selectConversationRequestSeq;
    set({ isLoading: true, error: null, activeConversationId: id });
    try {
      const { messages } = await tauri.getConversation(id);
      set((state) => {
        if (requestSeq !== selectConversationRequestSeq || state.activeConversationId !== id) {
          return state;
        }
        return { messages, isLoading: false };
      });
    } catch (error) {
      set((state) => {
        if (requestSeq !== selectConversationRequestSeq || state.activeConversationId !== id) {
          return state;
        }
        return { error: String(error), isLoading: false };
      });
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

  deleteConversations: async (ids: string[]) => {
    const idSet = new Set(ids);
    try {
      await tauri.deleteConversations(ids);
      set((state) => {
        const newConversations = state.conversations.filter((c) => !idSet.has(c.id));
        const activeStillExists = newConversations.some((c) => c.id === state.activeConversationId);
        return {
          conversations: newConversations,
          activeConversationId: activeStillExists ? state.activeConversationId : null,
          messages: activeStillExists ? state.messages : [],
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

    // Auto-create/retrieve default conversation if none active
    let conversationId = activeConversationId;
    if (!conversationId) {
      try {
        const conversation = await get().getOrCreateDefaultConversation();
        conversationId = conversation.id;
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
      role: 'user',
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
      set((state) => {
        const updatedConversations = result.conversation
          ? state.conversations.map((c) =>
              c.id === result.conversation.id ? result.conversation : c
            )
          : state.conversations;
        return {
          messages: [
            ...state.messages.map((m) => (m.id === tempId ? result.userMessage : m)),
            result.assistantMessage,
          ],
          isSending: false,
          conversations: updatedConversations,
        };
      });

      await get().fetchConversations();

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
      set({ messages, error: null });
    } catch (error) {
      console.error('[ConversationStore] Failed to refresh messages:', error);
      set({ error: String(error) });
    }
  },
  setMessages: (messages) => set({ messages }),
  setIsSending: (isSending) => set({ isSending }),
  setConversations: (conversations) => {
    set((state) => {
      const activeStillExists = conversations.some((c) => c.id === state.activeConversationId);
      return {
        conversations,
        activeConversationId: activeStillExists ? state.activeConversationId : null,
        messages: activeStillExists ? state.messages : [],
      };
    });
  },
}));
