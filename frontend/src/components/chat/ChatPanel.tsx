import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquarePlus, ArrowDown } from "lucide-react";
import { Streamdown } from "streamdown";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { Button } from "@/components/ui/button";
import type { Message } from "@/hooks/useChat";
import { useConversationStore } from "@/stores/conversationStore";

const NEAR_BOTTOM_THRESHOLD = 150;

interface ChatPanelProps {
  messages: Message[];
  onSend: (text: string) => void;
  isLoading: boolean;
  voiceSpeak?: (text: string) => void;
  hasActiveConversation: boolean;
  error?: string | null;
  conversationId?: string | null;
  voiceUserText?: string;
  voiceAssistantText?: string;
  isVoiceStreaming?: boolean;
}

export function ChatPanel({ messages, onSend, isLoading, hasActiveConversation, error, conversationId, voiceUserText, voiceAssistantText, isVoiceStreaming }: ChatPanelProps) {
  const createConversation = useConversationStore((s) => s.createConversation);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const prevConversationIdRef = useRef(conversationId);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    setShowScrollButton(false);
  }, []);

  // Track scroll position
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD;
      isNearBottomRef.current = nearBottom;
      setShowScrollButton(!nearBottom);
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Snap to bottom when switching conversations
  useEffect(() => {
    if (conversationId !== prevConversationIdRef.current) {
      prevConversationIdRef.current = conversationId;
      // Use requestAnimationFrame to wait for DOM to render
      requestAnimationFrame(() => scrollToBottom("instant"));
    }
  }, [conversationId, scrollToBottom]);

  // Auto-scroll on new messages / streaming when user is at bottom
  useEffect(() => {
    if (isNearBottomRef.current || isLoading || isVoiceStreaming) {
      scrollToBottom("smooth");
    }
  }, [messages, isLoading, error, voiceAssistantText, isVoiceStreaming, scrollToBottom]);

  if (!hasActiveConversation) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-muted-foreground">
        <MessageSquarePlus className="h-16 w-16 mb-4 opacity-30" />
        <h2 className="text-lg font-medium mb-2">开始新对话</h2>
        <p className="text-sm mb-6">选择一个对话或创建新对话开始</p>
        <Button onClick={() => createConversation()} className="gap-2">
          新建对话
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages area with scroll-to-bottom overlay */}
      <div className="flex-1 overflow-hidden relative">
        <div ref={scrollRef} className="h-full overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {/* Voice conversation: user message */}
          {voiceUserText && (
            <div className="flex justify-end">
              <div className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm max-w-[80%]">
                {voiceUserText}
              </div>
            </div>
          )}

          {/* Voice conversation: AI response (visible until persisted messages load) */}
          {voiceAssistantText && (
            <div className="flex justify-start">
              <div className="bg-secondary text-secondary-foreground rounded-lg px-4 py-2 text-sm max-w-[80%]">
                <Streamdown
                  mode={isVoiceStreaming ? "streaming" : "static"}
                  parseIncompleteMarkdown
                  className="prose prose-sm dark:prose-invert max-w-none"
                >
                  {voiceAssistantText}
                </Streamdown>
                {isVoiceStreaming && (
                  <span className="inline-block w-1.5 h-4 bg-foreground/50 animate-pulse ml-0.5 align-text-bottom" />
                )}
              </div>
            </div>
          )}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-secondary rounded-lg px-4 py-2 text-sm">
                <span className="animate-pulse">思考中...</span>
              </div>
            </div>
          )}
          {error && (
            <div className="flex justify-start">
              <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-lg px-4 py-2 text-sm">
                {error}
              </div>
            </div>
          )}
        </div>

        {/* Scroll to bottom button — pinned to bottom of messages container */}
        {showScrollButton && (
          <button
            onClick={() => scrollToBottom("smooth")}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary border shadow-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            <span>回到底部</span>
          </button>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border p-4">
        <ChatInput onSend={onSend} disabled={isLoading} />
      </div>
    </div>
  );
}
