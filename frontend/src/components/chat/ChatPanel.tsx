import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquarePlus, ArrowDown, Loader2 } from "lucide-react";
import { Streamdown } from "streamdown";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { Button } from "@/components/ui/button";
import type { Message } from "@/hooks/useChat";
import { useConversationStore } from "@/stores/conversationStore";


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
  const [hasNewMessage, setHasNewMessage] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    
    isNearBottomRef.current = true;
    setShowScrollButton(false);
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  // Track scroll position
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const threshold = 100;
      const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const nearBottom = distanceToBottom < threshold;
      
      isNearBottomRef.current = nearBottom;
      
      const isScrollable = el.scrollHeight > el.clientHeight;
      setShowScrollButton(!nearBottom && isScrollable);
      
      if (nearBottom) {
        setHasNewMessage(false);
      }
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Snap to bottom when switching conversations
  useEffect(() => {
    if (conversationId !== prevConversationIdRef.current) {
      prevConversationIdRef.current = conversationId;
      setHasNewMessage(false);
      
      // Perform initial snap and double-run after DOM rendering paints to ensure 100% bottom lock
      scrollToBottom("instant");
      const timer = setTimeout(() => {
        scrollToBottom("instant");
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [conversationId, scrollToBottom]);

  // Auto-scroll on new messages / streaming when user is at bottom
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    const isUserMessage = lastMessage && lastMessage.role === "user";

    if (isNearBottomRef.current || isUserMessage) {
      const behavior = (isLoading || isVoiceStreaming) ? "instant" : "smooth";
      
      // Immediate scroll, followed by a layout-paint delay retry to capture new browser size mutations
      scrollToBottom(behavior);
      const timer = setTimeout(() => {
        scrollToBottom(behavior);
      }, 60);
      setHasNewMessage(false);
      return () => clearTimeout(timer);
    } else {
      setHasNewMessage(true);
    }
  }, [messages, isLoading, error, voiceAssistantText, isVoiceStreaming, scrollToBottom]);

  if (!hasActiveConversation) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-muted-foreground">
        <MessageSquarePlus className="h-16 w-16 mb-4 opacity-30" />
        <h2 className="text-lg font-medium mb-2">开始新对话</h2>
        <p className="text-sm mb-6">选择一个对话或创建新对话开始</p>
        <Button onClick={() => createConversation().catch(console.error)} className="gap-2">
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
            <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="rounded-xl border border-cyan-500/15 bg-cyan-950/10 px-4 py-3 space-y-2 max-w-[80%] shadow-lg shadow-cyan-950/5">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                  <span className="font-mono text-xs font-bold text-cyan-400 tracking-wider">
                    JARVIS COGNITIVE DECRYPTING...
                  </span>
                </div>
                <div className="flex items-center gap-1.5 pl-5">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
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

        {/* Scroll to bottom button — centered pill above the input area */}
        {showScrollButton && (
          <button
            onClick={() => {
              scrollToBottom("smooth");
              setHasNewMessage(false);
            }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-4 py-2 rounded-full bg-background border border-border hover:bg-accent shadow-xl text-xs font-mono font-bold tracking-wider text-muted-foreground hover:text-foreground transition-all duration-300 transform scale-100 hover:scale-105 active:scale-95 animate-in fade-in slide-in-from-bottom-3 cursor-pointer group"
            title="回到底部"
          >
            <ArrowDown className="h-3.5 w-3.5 group-hover:translate-y-0.5 transition-transform duration-200" />
            <span>回到底部</span>
            {hasNewMessage && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
            )}
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
