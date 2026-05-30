import { useCallback, useRef, useState } from "react";
import { useConversationStore } from "@/stores/conversationStore";
import type { ConversationMessage } from "@/lib/tauri";
import * as tauri from "@/lib/tauri";
import { jarvisClient } from "@/lib/jarvisClient";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  toolCalls?: { name: string; args: unknown; result: unknown }[];
  isStreaming?: boolean;
}

function convertMessage(msg: ConversationMessage): Message {
  return {
    id: msg.id,
    role: msg.role as "user" | "assistant",
    content: msg.content,
    timestamp: new Date(msg.createdAt),
    toolCalls: msg.toolCalls ? JSON.parse(msg.toolCalls) : undefined,
    isStreaming: msg.id.startsWith("temp-assistant-"),
  };
}

export function useChat() {
  const {
    messages: rawMessages,
    isSending,
    activeConversationId,
    createConversation,
    error,
    setMessages,
    setIsSending,
    setConversations,
  } = useConversationStore();

  const [streamingContent, setStreamingContent] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const messages: Message[] = rawMessages.map(convertMessage);

  // Streaming send (direct SSE to Hono daemon)
  const sendMessage = useCallback(
    async (text: string) => {
      let conversationId = activeConversationId;
      if (!conversationId) {
        try {
          const conversation = await createConversation();
          conversationId = conversation.id;
        } catch (err) {
          console.error("Failed to create conversation:", err);
          return;
        }
      }

      setIsStreaming(true);
      setIsSending(true);
      setStreamingContent("");

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const userTempId = `temp-user-${Date.now()}`;
      const assistantTempId = `temp-assistant-${Date.now()}`;

      const optimisticUserMsg: ConversationMessage = {
        id: userTempId,
        conversationId: conversationId!,
        role: "user",
        content: text,
        toolCalls: null,
        toolCallId: null,
        createdAt: new Date().toISOString(),
      };

      const optimisticAssistantMsg: ConversationMessage = {
        id: assistantTempId,
        conversationId: conversationId!,
        role: "assistant",
        content: "",
        toolCalls: null,
        toolCallId: null,
        createdAt: new Date().toISOString(),
      };

      const currentMessages = [...rawMessages, optimisticUserMsg, optimisticAssistantMsg];
      setMessages(currentMessages);

      try {
        let fullText = "";
        const toolCallsMap = new Map<string, { name: string; args: unknown; result: unknown }>();
        let messageListUpdated = false;

        await jarvisClient.streamSSE({
          path: `/api/conversations/${conversationId}/messages/stream`,
          method: "POST",
          body: { content: text },
          signal: abortController.signal,
          onEvent({ event, data }) {
            if (event === "token") {
              try {
                const payload = JSON.parse(data) as { text: string };
                fullText += payload.text;
              } catch {
                fullText += data;
              }
              setStreamingContent(fullText);
              messageListUpdated = true;
            } else if (event === "tool-call") {
              try {
                const payload = JSON.parse(data) as { name: string; toolCallId: string; args: unknown };
                toolCallsMap.set(payload.toolCallId, { name: payload.name, args: payload.args, result: null });
                messageListUpdated = true;
              } catch (e) { console.warn("[useChat] Failed to parse tool-call event:", e); }
            } else if (event === "tool-result") {
              try {
                const payload = JSON.parse(data) as { name: string; toolCallId: string; result: unknown };
                const existing = toolCallsMap.get(payload.toolCallId);
                if (existing) {
                  existing.result = payload.result;
                  messageListUpdated = true;
                }
              } catch (e) { console.warn("[useChat] Failed to parse tool-result event:", e); }
            } else if (event === "done") {
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
                setMessages(updatedFromDb);
                tauri.listConversations().then(setConversations).catch(() => {});
                messageListUpdated = false;
              } catch (e) { console.warn("[useChat] Failed to parse done event:", e); }
            }

            if (messageListUpdated) {
              const updatedAssistant: ConversationMessage = {
                ...optimisticAssistantMsg,
                content: fullText,
                toolCalls: toolCallsMap.size > 0 ? JSON.stringify(Array.from(toolCallsMap.values())) : null,
              };
              setMessages(
                currentMessages.map((m) => (m.id === assistantTempId ? updatedAssistant : m)),
              );
            }
          },
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Streaming error, falling back to non-streaming send:", err);
          try {
            // Fallback to Rust-based non-streaming message send (always works, bypasses loopback/CORS restrictions)
            const result = await tauri.sendConversationMessage(conversationId!, text);
            if (result) {
              const updatedFromDb = currentMessages.map((m) => {
                if (m.id === userTempId) return result.userMessage;
                if (m.id === assistantTempId) return result.assistantMessage;
                return m;
              });
              setMessages(updatedFromDb);
              
              try {
                const convs = await tauri.listConversations();
                setConversations(convs);
              } catch {}
              return;
            }
          } catch (fallbackErr) {
            console.error("Fallback non-streaming send failed as well:", fallbackErr);
            useConversationStore.setState({
              error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
            });
          }
          setMessages(rawMessages);
        }
      } finally {
        setIsStreaming(false);
        setIsSending(false);
        abortControllerRef.current = null;
        setStreamingContent("");
      }
    },
    [activeConversationId, createConversation, rawMessages, setMessages, setIsSending, setConversations],
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
    isLoading: isSending,
    isStreaming,
    streamingContent,
    activeConversationId,
    error,
  };
}
