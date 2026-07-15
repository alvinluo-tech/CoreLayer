import { useCallback, useEffect, useRef, useState } from 'react';
import { useConversationStore } from '@/stores/conversationStore';
import type { ConversationMessage } from '@/lib/tauri';
import * as tauri from '@/lib/tauri';
import { jarvisClient } from '@/lib/jarvisClient';
import { useDataPanelStore } from '@/stores/dataPanelStore';

export interface PendingApproval {
  id: string;
  toolName: string;
  args: unknown;
  risk: 'low' | 'medium' | 'high' | 'critical';
  preview: string | null;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: { name: string; input: unknown; output: unknown }[];
  isStreaming?: boolean;
  modelUsed?: string | null;
  pendingApprovals?: PendingApproval[];
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
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [approvalRunId, setApprovalRunId] = useState<string | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortCleanupRef = useRef<{
    conversationId: string;
    userTempId: string;
    assistantTempId: string;
  } | null>(null);

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

      abortCleanupRef.current = {
        conversationId: conversationId!,
        userTempId,
        assistantTempId,
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
            } else if (event === 'approval_required') {
              try {
                const payload = JSON.parse(data) as {
                  runId: string;
                  conversationId: string;
                  approvals: PendingApproval[];
                };
                if (isTargetConversationActive()) {
                  setPendingApprovals(payload.approvals);
                  setApprovalRunId(payload.runId);
                }
              } catch (e) {
                console.warn('[useChat] Failed to parse approval_required event:', e);
              }
            } else if (event === 'done') {
              try {
                const payload = JSON.parse(data) as {
                  userMessage?: ConversationMessage;
                  assistantMessage?: ConversationMessage;
                  suspended?: boolean;
                  approvalRequestIds?: string[];
                };

                if (payload.suspended) {
                  // Stream ended due to approval — finalize the partial assistant message
                  const updatedAssistant: ConversationMessage = {
                    ...optimisticAssistantMsg,
                    content: fullText || '',
                    toolCalls:
                      toolCallsMap.size > 0
                        ? JSON.stringify(Array.from(toolCallsMap.values()))
                        : null,
                  };
                  setMessagesIfActive(
                    currentMessages.map((m) => (m.id === assistantTempId ? updatedAssistant : m))
                  );
                  // Start polling for new messages after approval
                  startApprovalPolling(conversationId!);
                  return;
                }

                if (payload.userMessage && payload.assistantMessage) {
                  const updatedFromDb = currentMessages.map((m) => {
                    if (m.id === userTempId) return payload.userMessage!;
                    if (m.id === assistantTempId) return payload.assistantMessage!;
                    return m;
                  });
                  setMessagesIfActive(updatedFromDb);
                  tauri
                    .listConversations()
                    .then(setConversations)
                    .catch(() => {});
                  messageListUpdated = false;
                }
              } catch (e) {
                console.warn('[useChat] Failed to parse done event:', e);
              }
            } else if (event === 'error') {
              // Backend-initiated run failure (cancel, error, etc.)
              try {
                const payload = JSON.parse(data) as { error: string };
                useConversationStore.setState({ error: payload.error });
              } catch {
                useConversationStore.setState({ error: data });
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
        abortCleanupRef.current = null;
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

  const stopApprovalPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  const startApprovalPolling = useCallback(
    (convId: string) => {
      let attempts = 0;
      const maxAttempts = 60; // 2 minutes at 2s intervals

      pollingIntervalRef.current = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
          stopApprovalPolling();
          return;
        }
        try {
          const { messages: freshMessages } = await tauri.getConversation(convId);
          const state = useConversationStore.getState();
          if (state.activeConversationId !== convId) {
            stopApprovalPolling();
            return;
          }
          const hasNewAssistantMsg = freshMessages.some(
            (fm) => fm.role === 'assistant' && !state.messages.some((cm) => cm.id === fm.id)
          );
          if (hasNewAssistantMsg) {
            setMessages(freshMessages);
            setPendingApprovals([]);
            setApprovalRunId(null);
            stopApprovalPolling();
            tauri
              .listConversations()
              .then(setConversations)
              .catch(() => {});
          }
        } catch {
          // Poll failure is non-critical, will retry
        }
      }, 2_000);
    },
    [stopApprovalPolling, setMessages, setConversations]
  );

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const stopStreaming = useCallback(() => {
    // Clean up optimistic messages before aborting
    const cleanup = abortCleanupRef.current;
    if (cleanup) {
      const state = useConversationStore.getState();
      if (state.activeConversationId === cleanup.conversationId) {
        const msgs = state.messages.filter(
          (m) => m.id !== cleanup.userTempId && m.id !== cleanup.assistantTempId
        );
        setMessages(msgs);
      }
      abortCleanupRef.current = null;
    }
    abortControllerRef.current?.abort();
  }, [setMessages]);

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
    pendingApprovals,
    approvalRunId,
    approveInline: async (approvalId: string) => {
      await jarvisClient.post(`/api/approvals/${approvalId}/approve`);
      setPendingApprovals((prev) => prev.filter((app) => app.id !== approvalId));
      if (pendingApprovals.length <= 1) {
        setApprovalRunId(null);
      }
    },
    denyInline: async (approvalId: string) => {
      await jarvisClient.post(`/api/approvals/${approvalId}/deny`);
      setPendingApprovals((prev) => prev.filter((app) => app.id !== approvalId));
      if (pendingApprovals.length <= 1) {
        setApprovalRunId(null);
      }
    },
  };
}
