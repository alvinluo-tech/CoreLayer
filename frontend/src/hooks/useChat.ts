import { useCallback, useRef, useState } from 'react';
import { useConversationStore } from '@/stores/conversationStore';
import type { ConversationMessage } from '@/lib/tauri';
import * as tauri from '@/lib/tauri';
import { jarvisClient } from '@/lib/jarvisClient';
import { useDataPanelStore } from '@/stores/dataPanelStore';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: { name: string; input: unknown; output: unknown }[];
  isStreaming?: boolean;
  modelUsed?: string | null;
}

function convertMessage(msg: ConversationMessage): Message {
  return {
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
    timestamp: new Date(msg.createdAt),
    toolCalls: msg.toolCalls ? JSON.parse(msg.toolCalls) : undefined,
    isStreaming: msg.id.startsWith('temp-assistant-'),
    modelUsed: msg.modelUsed,
  };
}

export function useChat() {
  const {
    messages: rawMessages,
    isSending,
    activeConversationId,
    createConversation,
    getOrCreateDefaultConversation,
    error,
    setMessages,
    setIsSending,
    setConversations,
  } = useConversationStore();

  const [streamingContent, setStreamingContent] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamConversationId, setStreamConversationId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const messages: Message[] = rawMessages.map(convertMessage);

  // Streaming send (direct SSE to Hono daemon)
  const sendMessage = useCallback(
    async (text: string) => {
      let conversationId = activeConversationId;
      if (!conversationId) {
        try {
          const conversation = await getOrCreateDefaultConversation();
          conversationId = conversation.id;
        } catch (err) {
          console.error('Failed to get or create default conversation:', err);
          return;
        }
      }

      setIsStreaming(true);
      setIsSending(true);
      setStreamConversationId(conversationId!);
      setStreamingContent('');

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const userTempId = `temp-user-${Date.now()}`;
      const assistantTempId = `temp-assistant-${Date.now()}`;

      const optimisticUserMsg: ConversationMessage = {
        id: userTempId,
        conversationId: conversationId!,
        role: 'user',
        content: text,
        toolCalls: null,
        toolCallId: null,
        createdAt: new Date().toISOString(),
      };

      const optimisticAssistantMsg: ConversationMessage = {
        id: assistantTempId,
        conversationId: conversationId!,
        role: 'assistant',
        content: '',
        toolCalls: null,
        toolCallId: null,
        createdAt: new Date().toISOString(),
      };

      const isTargetConversationActive = () =>
        useConversationStore.getState().activeConversationId === conversationId;
      const setMessagesIfActive = (nextMessages: ConversationMessage[]) => {
        if (isTargetConversationActive()) {
          setMessages(nextMessages);
        }
      };

      const currentMessages = [...rawMessages, optimisticUserMsg, optimisticAssistantMsg];
      setMessagesIfActive(currentMessages);

      try {
        let fullText = '';
        const toolCallsMap = new Map<string, { name: string; input: unknown; output: unknown }>();
        let messageListUpdated = false;

        await jarvisClient.streamSSE({
          path: `/api/conversations/${conversationId}/messages/stream`,
          method: 'POST',
          body: { content: text },
          signal: abortController.signal,
          onEvent({ event, data }) {
            if (event === 'delta') {
              try {
                const payload = JSON.parse(data) as { text: string };
                fullText += payload.text;
              } catch {
                fullText += data;
              }
              if (isTargetConversationActive()) {
                setStreamingContent(fullText);
              }
              messageListUpdated = true;
            } else if (event === 'thinking') {
              // Thinking tokens are not displayed in the main chat UI yet.
              // The event is received and acknowledged for future use.
            } else if (event === 'tool_calls') {
              try {
                const payload = JSON.parse(data) as {
                  name: string;
                  toolCallId: string;
                  input: unknown;
                };
                toolCallsMap.set(payload.toolCallId, {
                  name: payload.name,
                  input: payload.input,
                  output: null,
                });
                messageListUpdated = true;
              } catch (e) {
                console.warn('[useChat] Failed to parse tool_calls event:', e);
              }
            } else if (event === 'tool_result') {
              try {
                const payload = JSON.parse(data) as {
                  name: string;
                  toolCallId: string;
                  output: unknown;
                };
                const existing = toolCallsMap.get(payload.toolCallId);
                if (existing) {
                  existing.output = payload.output;
                  messageListUpdated = true;
                }

                // Dispatch to data panel
                const resultPayload = payload.output as Record<string, unknown> | undefined;
                const panelData =
                  resultPayload && typeof resultPayload === 'object' && 'data' in resultPayload
                    ? resultPayload.data
                    : payload.output;

                if (panelData != null && isTargetConversationActive()) {
                  useDataPanelStore.getState().addEntry({
                    toolCallId: payload.toolCallId,
                    toolName: payload.name,
                    title: payload.name.replace(/_/g, ' '),
                    data: panelData,
                  });
                }
              } catch (e) {
                console.warn('[useChat] Failed to parse tool_result event:', e);
              }
            } else if (event === 'done') {
              try {
                const payload = JSON.parse(data) as {
                  userMessage: ConversationMessage;
                  assistantMessage: ConversationMessage;
                };
                const updatedFromDb = currentMessages.map((m) => {
                  if (m.id === userTempId) return payload.userMessage;
                  if (m.id === assistantTempId) return payload.assistantMessage;
                  return m;
                });
                setMessagesIfActive(updatedFromDb);
                tauri
                  .listConversations()
                  .then(setConversations)
                  .catch(() => {});
                messageListUpdated = false;
              } catch (e) {
                console.warn('[useChat] Failed to parse done event:', e);
              }
            }

            if (messageListUpdated) {
              const updatedAssistant: ConversationMessage = {
                ...optimisticAssistantMsg,
                content: fullText,
                toolCalls:
                  toolCallsMap.size > 0 ? JSON.stringify(Array.from(toolCallsMap.values())) : null,
              };
              setMessagesIfActive(
                currentMessages.map((m) => (m.id === assistantTempId ? updatedAssistant : m))
              );
            }
          },
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Streaming error, falling back to non-streaming send:', err);
          try {
            // Fallback to Rust-based non-streaming message send (always works, bypasses loopback/CORS restrictions)
            const result = await tauri.sendConversationMessage(conversationId!, text);
            if (result) {
              const updatedFromDb = currentMessages.map((m) => {
                if (m.id === userTempId) return result.userMessage;
                if (m.id === assistantTempId) return result.assistantMessage;
                return m;
              });
              setMessagesIfActive(updatedFromDb);

              try {
                const convs = await tauri.listConversations();
                setConversations(convs);
              } catch {
                // Conversation refresh after fallback is best-effort
              }
              return;
            }
          } catch (fallbackErr) {
            console.error('Fallback non-streaming send failed as well:', fallbackErr);
            useConversationStore.setState({
              error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
            });
          }
          setMessagesIfActive(rawMessages);
        }
      } finally {
        setIsStreaming(false);
        setIsSending(false);
        setStreamConversationId(null);
        abortControllerRef.current = null;
        setStreamingContent('');
      }
    },
    [
      activeConversationId,
      getOrCreateDefaultConversation,
      rawMessages,
      setMessages,
      setIsSending,
      setConversations,
    ]
  );

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const startNewChat = useCallback(async () => {
    return createConversation();
  }, [createConversation]);

  return {
    messages,
    sendMessage,
    stopStreaming,
    startNewChat,
    isLoading: isSending && activeConversationId === streamConversationId,
    isStreaming: isStreaming && activeConversationId === streamConversationId,
    streamingContent,
    activeConversationId,
    error,
  };
}
