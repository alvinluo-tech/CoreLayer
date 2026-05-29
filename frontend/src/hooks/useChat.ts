import { useCallback, useRef, useState, useEffect } from "react";
import { useConversationStore } from "@/stores/conversationStore";
import type { ConversationMessage, Conversation } from "@/lib/tauri";
import * as tauri from "@/lib/tauri";

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
  const [daemonUrl, setDaemonUrl] = useState("http://127.0.0.1:3001");
  const abortControllerRef = useRef<AbortController | null>(null);

  const messages: Message[] = rawMessages.map(convertMessage);

  // Discover daemon URL from Tauri backend on mount to avoid CORS/host mismatches
  useEffect(() => {
    tauri.getDaemonUrl()
      .then((url) => {
        setDaemonUrl(url);
        console.log("[useChat] Dynamically discovered Daemon URL:", url);
      })
      .catch(() => {
        console.warn("[useChat] Could not get daemon URL, using default http://127.0.0.1:3001");
      });
  }, []);

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
        const response = await fetch(`${daemonUrl}/api/conversations/${conversationId}/messages/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader");

        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "token";
        let fullText = "";
        const toolCallsMap = new Map<string, { name: string; args: unknown; result: unknown }>();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          let messageListUpdated = false;

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (!data) continue;

              if (currentEvent === "token") {
                try {
                  const payload = JSON.parse(data) as { text: string };
                  fullText += payload.text;
                } catch {
                  fullText += data;
                }
                setStreamingContent(fullText);
                messageListUpdated = true;
              } else if (currentEvent === "tool-call") {
                try {
                  const payload = JSON.parse(data) as { name: string; toolCallId: string; args: unknown };
                  toolCallsMap.set(payload.toolCallId, {
                    name: payload.name,
                    args: payload.args,
                    result: null,
                  });
                  messageListUpdated = true;
                } catch {}
              } else if (currentEvent === "tool-result") {
                try {
                  const payload = JSON.parse(data) as { name: string; toolCallId: string; result: unknown };
                  const existing = toolCallsMap.get(payload.toolCallId);
                  if (existing) {
                    existing.result = payload.result;
                    messageListUpdated = true;
                  }
                } catch {}
              } else if (currentEvent === "done") {
                try {
                  const payload = JSON.parse(data) as {
                    userMessage: ConversationMessage;
                    assistantMessage: ConversationMessage;
                    conversation: Conversation;
                  };

                  const updatedFromDb = currentMessages.map((m) => {
                    if (m.id === userTempId) return payload.userMessage;
                    if (m.id === assistantTempId) return payload.assistantMessage;
                    return m;
                  });
                  setMessages(updatedFromDb);

                  try {
                    const convs = await tauri.listConversations();
                    setConversations(convs);
                  } catch {}

                  messageListUpdated = false;
                } catch {}
              }
            }
          }

          if (messageListUpdated) {
            const updatedAssistant: ConversationMessage = {
              ...optimisticAssistantMsg,
              content: fullText,
              toolCalls: toolCallsMap.size > 0 ? JSON.stringify(Array.from(toolCallsMap.values())) : null,
            };
            setMessages(
              currentMessages.map((m) => {
                if (m.id === assistantTempId) return updatedAssistant;
                return m;
              }),
            );
          }
        }
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
    [activeConversationId, createConversation, rawMessages, setMessages, setIsSending, setConversations, daemonUrl],
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
