import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquarePlus, ArrowDown, Loader2 } from 'lucide-react';
import { ChatErrorCard } from '@/components/chat/ChatErrorCard';
import { Streamdown } from 'streamdown';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { Button } from '@/components/ui/button';
import type { Message } from '@/hooks/useChat';
import { useConversationStore } from '@/stores/conversationStore';

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

export function ChatPanel({
  messages,
  onSend,
  isLoading,
  hasActiveConversation,
  error,
  conversationId,
  voiceUserText,
  voiceAssistantText,
  isVoiceStreaming,
}: ChatPanelProps) {
  const createConversation = useConversationStore((s) => s.createConversation);
  const conversations = useConversationStore((s) => s.conversations);
  const activeConversation = conversations.find((c) => c.id === conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const prevConversationIdRef = useRef(conversationId);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;

    isNearBottomRef.current = true;
    setShowScrollButton(false);
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

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

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (conversationId !== prevConversationIdRef.current) {
      prevConversationIdRef.current = conversationId;
      setHasNewMessage(false);

      scrollToBottom('instant');
      const timer = setTimeout(() => {
        scrollToBottom('instant');
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [conversationId, scrollToBottom]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    const isUserMessage = lastMessage && lastMessage.role === 'user';

    if (isNearBottomRef.current || isUserMessage) {
      const behavior = isLoading || isVoiceStreaming ? 'instant' : 'smooth';

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
      <div
        className="flex flex-col h-full items-center justify-center"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <MessageSquarePlus className="h-16 w-16 mb-4 opacity-20" />
        <h2
          className="text-lg font-medium mb-2"
          style={{ fontFamily: 'var(--font-hud)', color: 'var(--text-secondary)' }}
        >
          Start New Session
        </h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text-tertiary)' }}>
          Select a conversation or create a new one
        </p>
        <Button
          onClick={() => createConversation().catch(console.error)}
          variant="glass"
          className="gap-2"
        >
          New Conversation
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Token usage header — HUD label style */}
      {activeConversation &&
        (activeConversation.promptTokens > 0 || activeConversation.completionTokens > 0) && (
          <div
            className="flex items-center justify-between px-5 py-1.5"
            style={{ borderBottom: '1px solid var(--glass-border)' }}
          >
            <span
              style={{
                fontFamily: 'var(--font-hud)',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 2,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
              }}
            >
              // Active Session
            </span>
            <span
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                letterSpacing: 0.5,
                color: 'var(--text-tertiary)',
              }}
            >
              {activeConversation.promptTokens.toLocaleString()} prompt ·{' '}
              {activeConversation.completionTokens.toLocaleString()} completion
            </span>
          </div>
        )}

      {/* Messages area */}
      <div className="flex-1 overflow-hidden relative">
        <div ref={scrollRef} className="h-full overflow-y-auto px-6 py-4 space-y-3.5">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {/* Voice: user message */}
          {voiceUserText && (
            <div className="flex justify-end my-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div
                className="rounded-2xl rounded-tr-sm px-4 py-3 text-sm max-w-[80%]"
                style={{
                  background: 'linear-gradient(135deg, rgba(0,212,255,0.1), rgba(61,122,255,0.08))',
                  border: '1px solid rgba(0,212,255,0.12)',
                  color: 'var(--text-primary)',
                }}
              >
                {voiceUserText}
              </div>
            </div>
          )}

          {/* Voice: AI response */}
          {voiceAssistantText && (
            <div className="flex justify-start my-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div
                className="rounded-2xl rounded-tl-sm px-4 py-3.5 text-sm max-w-[80%]"
                style={{
                  background: 'var(--glass-bg)',
                  border: '1px solid var(--glass-border)',
                  backdropFilter: 'blur(12px)',
                  color: 'var(--text-primary)',
                }}
              >
                <Streamdown
                  mode={isVoiceStreaming ? 'streaming' : 'static'}
                  parseIncompleteMarkdown
                  className="prose prose-sm dark:prose-invert max-w-none"
                >
                  {voiceAssistantText}
                </Streamdown>
                {isVoiceStreaming && (
                  <span
                    className="inline-block w-1.5 h-4 animate-pulse ml-0.5 align-text-bottom"
                    style={{ background: 'var(--violet)' }}
                  />
                )}
              </div>
            </div>
          )}

          {/* Loading state — Holo style */}
          {isLoading && (
            <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div
                className="rounded-xl px-4 py-3.5 space-y-2.5 max-w-[80%] relative overflow-hidden"
                style={{
                  border: '1px solid rgba(167,139,250,0.12)',
                  background: 'var(--glass-bg)',
                  backdropFilter: 'blur(12px)',
                }}
              >
                {/* Top glow line */}
                <div
                  className="absolute top-0 left-0 w-full h-px"
                  style={{
                    background: 'linear-gradient(90deg, transparent, var(--violet), transparent)',
                  }}
                />
                <div className="flex items-center gap-2">
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    style={{ color: 'var(--violet)' }}
                  />
                  <span
                    style={{
                      fontFamily: 'var(--font-hud)',
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 2,
                      color: 'var(--violet)',
                    }}
                  >
                    JARVIS PROCESSING...
                  </span>
                </div>
                {/* Wave bars */}
                <div className="flex items-center gap-0.5 pl-5">
                  {[6, 12, 18, 12, 6, 14, 8].map((h, i) => (
                    <span
                      key={i}
                      className="w-0.5 rounded-full"
                      style={{
                        height: h,
                        background: 'var(--violet)',
                        animation: `waveBar 1s ease-in-out infinite`,
                        animationDelay: `${i * 0.1}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && (
            <ChatErrorCard
              error={error}
              onRetry={() => {
                const lastUserMsg = messages.filter((m) => m.role === 'user').pop();
                if (lastUserMsg) onSend(lastUserMsg.content);
              }}
            />
          )}
        </div>

        {/* Scroll to bottom button — glass pill */}
        {showScrollButton && (
          <button
            onClick={() => {
              scrollToBottom('smooth');
              setHasNewMessage(false);
            }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-4 py-2 rounded-full transition-all duration-200 cursor-pointer"
            style={{
              background: 'rgba(8,12,24,0.9)',
              border: '1px solid var(--glass-border)',
              backdropFilter: 'blur(12px)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              letterSpacing: 1,
            }}
            title="Scroll to bottom"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            <span>Bottom</span>
            {hasNewMessage && (
              <span className="relative flex h-2 w-2">
                <span
                  className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{ background: 'var(--cyan)' }}
                />
                <span
                  className="relative inline-flex rounded-full h-2 w-2"
                  style={{ background: 'var(--cyan)' }}
                />
              </span>
            )}
          </button>
        )}
      </div>

      {/* Input area — glass border top */}
      <div className="p-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
        <ChatInput onSend={onSend} disabled={isLoading} />
      </div>
    </div>
  );
}
