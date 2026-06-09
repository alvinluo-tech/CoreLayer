import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Brain,
  ChevronDown,
  ChevronUp,
  Check,
  Copy,
  Loader2,
  CheckCircle2,
  Terminal,
  ListTodo,
  Bookmark,
} from 'lucide-react';
import { Streamdown } from 'streamdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: { name: string; input: unknown; output: unknown }[];
  isStreaming?: boolean;
  modelUsed?: string | null;
}

interface MessageBubbleProps {
  message: Message;
}

function parseThoughtAndContent(content: string) {
  const thoughtRegex = /<thought>([\s\S]*?)(<\/thought>|$)/;
  const match = content.match(thoughtRegex);

  if (match) {
    const thought = (match[1] || '').trim();
    const rest = content.replace(thoughtRegex, '').trim();
    return { thought, content: rest, isThoughtClosed: !!match[2] };
  }

  return { thought: null, content, isThoughtClosed: true };
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const {
    thought,
    content: cleanContent,
    isThoughtClosed,
  } = parseThoughtAndContent(message.content);

  const [isThoughtExpanded, setIsThoughtExpanded] = useState(!isThoughtClosed);
  const [copied, setCopied] = useState(false);

  const hasThought = !!thought;

  useEffect(() => {
    if (isThoughtClosed) {
      setIsThoughtExpanded(false);
    } else if (hasThought) {
      setIsThoughtExpanded(true);
    }
  }, [isThoughtClosed, hasThought]);

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silently fail
    }
  };

  return (
    <div
      className={cn(
        'flex w-full group/bubble my-3 animate-in fade-in slide-in-from-bottom-2 duration-300',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3 text-sm transition-all duration-200 relative overflow-hidden',
          isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'
        )}
        style={
          isUser
            ? {
                background: 'linear-gradient(135deg, rgba(0,212,255,0.1), rgba(61,122,255,0.08))',
                border: '1px solid rgba(0,212,255,0.12)',
                color: 'var(--text-primary)',
              }
            : {
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                backdropFilter: 'blur(12px)',
                color: 'var(--text-primary)',
                position: 'relative',
              }
        }
      >
        {/* Assistant left accent line — violet in Holo, subtle in Focus */}
        {!isUser && (
          <div
            className="absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-full"
            style={{
              background: 'linear-gradient(180deg, var(--violet), transparent)',
              opacity: 0.5,
            }}
          />
        )}

        {isUser ? (
          <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        ) : (
          <div className="space-y-3 pl-2">
            {/* Thought/reasoning card */}
            {thought && (
              <div
                className="rounded-xl overflow-hidden transition-all duration-300"
                style={{
                  border: isThoughtClosed
                    ? '1px solid var(--glass-border)'
                    : '1px solid rgba(167,139,250,0.2)',
                  background: isThoughtClosed
                    ? 'rgba(255,255,255,0.02)'
                    : 'linear-gradient(135deg, rgba(167,139,250,0.05), rgba(124,58,237,0.05))',
                }}
              >
                <button
                  onClick={() => setIsThoughtExpanded(!isThoughtExpanded)}
                  className="w-full flex items-center justify-between px-3 py-2 text-[11px] transition-colors duration-200"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <div className="flex items-center gap-2">
                    {isThoughtClosed ? (
                      <CheckCircle2 className="h-3 w-3" style={{ color: 'var(--emerald)' }} />
                    ) : (
                      <Brain
                        className="h-3 w-3 animate-spin-slow"
                        style={{ color: 'var(--violet)' }}
                      />
                    )}
                    <span
                      style={{ fontFamily: 'var(--font-hud)', fontWeight: 600, letterSpacing: 0.5 }}
                    >
                      {isThoughtClosed ? 'Reasoning Complete' : 'Processing...'}
                    </span>
                  </div>
                  <div
                    className="flex items-center gap-1"
                    style={{ fontFamily: 'var(--font-data)', fontSize: 9 }}
                  >
                    <span>{isThoughtExpanded ? 'Collapse' : 'Expand'}</span>
                    {isThoughtExpanded ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </div>
                </button>

                {isThoughtExpanded && (
                  <div
                    className="px-3 pb-3 pt-1.5 text-xs border-t leading-relaxed whitespace-pre-wrap"
                    style={{
                      fontFamily: 'var(--font-data)',
                      color: 'var(--text-tertiary)',
                      borderColor: 'rgba(255,255,255,0.04)',
                      background: 'rgba(0,0,0,0.15)',
                    }}
                  >
                    {thought}
                    {!isThoughtClosed && (
                      <span
                        className="inline-block w-1.5 h-3 animate-pulse ml-0.5"
                        style={{ background: 'var(--violet)' }}
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Main response content */}
            {cleanContent ? (
              <div className="relative leading-relaxed markdown-body">
                <Streamdown
                  key={message.isStreaming && isThoughtClosed ? 'streaming' : 'static'}
                  mode={message.isStreaming && isThoughtClosed ? 'streaming' : 'static'}
                  parseIncompleteMarkdown={true}
                >
                  {cleanContent}
                </Streamdown>
              </div>
            ) : (
              message.isStreaming &&
              !thought && (
                <div
                  className="flex items-center gap-2 py-1 animate-pulse"
                  style={{ color: 'var(--violet)' }}
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span
                    style={{
                      fontFamily: 'var(--font-hud)',
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: 1,
                    }}
                  >
                    GENERATING...
                  </span>
                </div>
              )
            )}

            {/* Tool calls */}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div
                className="mt-3 pt-3 space-y-2"
                style={{ borderTop: '1px solid var(--glass-border)' }}
              >
                {message.toolCalls.map((tc, i) => {
                  const isPending = message.isStreaming && tc.output === null;
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-xs transition-all duration-200"
                      style={{
                        fontFamily: 'var(--font-data)',
                        background: isPending ? 'rgba(255,184,0,0.05)' : 'rgba(0,0,0,0.15)',
                        border: `1px solid ${isPending ? 'rgba(255,184,0,0.2)' : 'var(--glass-border)'}`,
                        color: isPending ? 'var(--amber)' : 'var(--text-tertiary)',
                      }}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        {isPending ? (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            style={{ color: 'var(--amber)' }}
                          />
                        ) : (
                          <Terminal className="h-3 w-3" style={{ color: 'var(--emerald)' }} />
                        )}
                        <span style={{ color: 'var(--text-secondary)' }}>$ call:</span>
                        <span
                          className="truncate font-semibold"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {tc.name}
                        </span>
                      </div>

                      {Boolean(tc.input) && (
                        <span
                          className="text-[10px] opacity-60 truncate max-w-[40%] px-1.5 py-0.5 rounded"
                          style={{
                            background: 'rgba(0,0,0,0.2)',
                            border: '1px solid var(--glass-border)',
                          }}
                        >
                          {JSON.stringify(tc.input)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Footer — timestamp + hover actions */}
        <div
          className="flex items-center justify-between gap-4 mt-2.5 pt-2"
          style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
        >
          <div className="flex items-center gap-2">
            <time
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 9,
                color: 'var(--text-tertiary)',
                letterSpacing: 0.5,
              }}
            >
              {message.timestamp.toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>

            {!isUser && message.modelUsed && (
              <div
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-all duration-300"
                style={{
                  fontFamily: 'var(--font-data)',
                  background: 'rgba(0, 212, 255, 0.05)',
                  border: '1px solid rgba(0, 212, 255, 0.12)',
                  color: 'var(--cyan)',
                  letterSpacing: 0.2,
                }}
              >
                <span
                  className="w-1 h-1 rounded-full animate-pulse"
                  style={{ background: 'var(--cyan)' }}
                />
                <span>{message.modelUsed}</span>
              </div>
            )}
          </div>

          {!isUser && !message.isStreaming && (
            <div className="flex items-center gap-1 opacity-0 group-hover/bubble:opacity-100 transition-all duration-200">
              <button
                onClick={handleCopyText}
                className="flex items-center justify-center w-6 h-6 rounded cursor-pointer transition-all duration-150"
                style={{
                  border: '1px solid var(--glass-border)',
                  background: 'rgba(8,12,24,0.9)',
                  color: copied ? 'var(--emerald)' : 'var(--text-tertiary)',
                }}
                onMouseEnter={(e) => {
                  if (!copied) {
                    e.currentTarget.style.borderColor = 'var(--cyan)';
                    e.currentTarget.style.color = 'var(--cyan)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!copied) {
                    e.currentTarget.style.borderColor = 'var(--glass-border)';
                    e.currentTarget.style.color = 'var(--text-tertiary)';
                  }
                }}
                title="Copy"
              >
                {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
              </button>
              <button
                className="flex items-center justify-center w-6 h-6 rounded cursor-pointer transition-all duration-150"
                style={{
                  border: '1px solid var(--glass-border)',
                  background: 'rgba(8,12,24,0.9)',
                  color: 'var(--text-tertiary)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--cyan)';
                  e.currentTarget.style.color = 'var(--cyan)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--glass-border)';
                  e.currentTarget.style.color = 'var(--text-tertiary)';
                }}
                title="Create Task"
              >
                <ListTodo className="h-2.5 w-2.5" />
              </button>
              <button
                className="flex items-center justify-center w-6 h-6 rounded cursor-pointer transition-all duration-150"
                style={{
                  border: '1px solid var(--glass-border)',
                  background: 'rgba(8,12,24,0.9)',
                  color: 'var(--text-tertiary)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--cyan)';
                  e.currentTarget.style.color = 'var(--cyan)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--glass-border)';
                  e.currentTarget.style.color = 'var(--text-tertiary)';
                }}
                title="Save"
              >
                <Bookmark className="h-2.5 w-2.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
