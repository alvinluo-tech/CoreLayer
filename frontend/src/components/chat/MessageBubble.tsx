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
  X,
} from 'lucide-react';
import { Streamdown } from 'streamdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: { name: string; args: unknown; result: unknown }[];
  isStreaming?: boolean;
}

interface MessageBubbleProps {
  message: Message;
}

// Helper to extract and separate the thought block from standard markdown content
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
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    if (isThoughtClosed) {
      setIsThoughtExpanded(false);
    } else if (thought) {
      setIsThoughtExpanded(true);
    }
  }, [isThoughtClosed, !!thought]);

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text', err);
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 2000);
    }
  };

  return (
    <div
      className={cn(
        'flex w-full group/bubble my-5 animate-in fade-in slide-in-from-bottom-2 duration-300',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3.5 text-sm shadow-sm transition-all duration-300 relative border overflow-hidden',
          isUser
            ? 'bg-gradient-to-br from-indigo-600 to-blue-600 dark:from-indigo-500 dark:to-blue-600 text-primary-foreground border-primary/20 rounded-tr-sm shadow-[0_4px_12px_rgba(99,102,241,0.15)]'
            : 'bg-card/60 backdrop-blur-md text-card-foreground border-border/60 rounded-tl-sm hover:shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:hover:shadow-[0_4px_20px_rgba(0,0,0,0.15)] hover:border-border/80'
        )}
      >
        {/* User Message Rendering */}
        {isUser ? (
          <p className="whitespace-pre-wrap leading-relaxed tracking-tight">{message.content}</p>
        ) : (
          <div className="space-y-3.5">
            {/* 1. Reasoning/Thought Process Card (Stellar futuristic processor display) */}
            {thought && (
              <div
                className={cn(
                  'rounded-xl border transition-all duration-500 overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]',
                  isThoughtClosed
                    ? 'border-border/60 bg-muted/20 hover:border-border/80'
                    : 'border-purple-500/20 dark:border-purple-500/30 bg-gradient-to-br from-purple-500/5 via-violet-500/5 to-indigo-500/5'
                )}
              >
                {/* Header bar */}
                <button
                  onClick={() => setIsThoughtExpanded(!isThoughtExpanded)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 text-[11px] font-medium text-muted-foreground/80 hover:text-foreground transition-colors duration-200"
                >
                  <div className="flex items-center gap-2">
                    {isThoughtClosed ? (
                      <div className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/10 text-emerald-500 shadow-sm border border-emerald-500/20">
                        <CheckCircle2 className="h-3 w-3" />
                      </div>
                    ) : (
                      <div className="relative flex items-center justify-center w-4 h-4 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-[0_0_8px_rgba(168,85,247,0.1)]">
                        <Brain className="h-3 w-3 animate-spin-slow" />
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-20"></span>
                      </div>
                    )}
                    <span className="font-semibold tracking-tight">
                      {isThoughtClosed ? '已完成深度思考与分析' : 'Jarvis 正在进行多维逻辑解密...'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[9px] opacity-75">
                    <span>{isThoughtExpanded ? '折叠' : '展开'}</span>
                    {isThoughtExpanded ? (
                      <ChevronUp className="h-3 w-3 stroke-[2.5]" />
                    ) : (
                      <ChevronDown className="h-3 w-3 stroke-[2.5]" />
                    )}
                  </div>
                </button>

                {/* Thought text area */}
                {isThoughtExpanded && (
                  <div className="px-3.5 pb-3.5 pt-1.5 text-xs text-muted-foreground/90 border-t border-border/20 leading-relaxed font-mono whitespace-pre-wrap bg-muted/10">
                    {thought}
                    {!isThoughtClosed && (
                      <span className="inline-block w-1.5 h-3 bg-purple-500/50 animate-pulse ml-0.5" />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 2. Main Response content using Vercel Streamdown in streaming mode */}
            {cleanContent ? (
              <div className="relative leading-relaxed prose prose-sm dark:prose-invert max-w-none markdown-body text-foreground/90 font-normal">
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
                <div className="flex items-center gap-2 text-muted-foreground py-1 animate-pulse">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-xs font-medium">正在生成最优回复...</span>
                </div>
              )
            )}

            {/* 3. Streaming/Saved Tool Calls execution visual blocks (futuristic console logs) */}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="mt-3.5 pt-3.5 border-t border-border/30 space-y-2">
                {message.toolCalls.map((tc, i) => {
                  const isPending = message.isStreaming && tc.result === null;
                  return (
                    <div
                      key={i}
                      className={cn(
                        'flex items-center justify-between gap-3 px-3 py-2 rounded-xl border text-xs font-mono transition-all duration-300 shadow-[inset_0_1px_1px_rgba(0,0,0,0.01)]',
                        isPending
                          ? 'bg-amber-500/5 border-amber-500/20 text-amber-600 dark:text-amber-400'
                          : 'bg-zinc-950/5 dark:bg-zinc-950/30 border-border/40 text-muted-foreground hover:border-primary/25'
                      )}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        {isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                        ) : (
                          <div className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            <Terminal className="h-2.5 w-2.5" />
                          </div>
                        )}
                        <span className="font-bold text-foreground/75 flex items-center gap-1">
                          <span>$</span>
                          <span>call:</span>
                        </span>
                        <span className="truncate font-semibold text-foreground/80">{tc.name}</span>
                      </div>

                      {Boolean(tc.args) && (
                        <span className="text-[10px] opacity-60 truncate max-w-[40%] bg-background/50 dark:bg-zinc-800/50 px-1.5 py-0.5 rounded border border-border/20">
                          {JSON.stringify(tc.args)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Footer controls & Timestamp */}
        <div className="flex items-center justify-between gap-4 mt-3 pt-2.5 border-t border-border/10">
          <time className="text-[10px] text-muted-foreground/60 select-none font-mono">
            {message.timestamp.toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>

          {/* Premium copy pill button */}
          {!isUser && !message.isStreaming && (
            <button
              onClick={handleCopyText}
              className="px-2 py-1 bg-background hover:bg-accent text-muted-foreground hover:text-foreground border border-border/30 hover:border-border/60 rounded-full shadow-sm flex items-center gap-1 opacity-0 group-hover/bubble:opacity-100 transition-all duration-300 scale-95 group-hover/bubble:scale-100 cursor-pointer text-[10px] font-medium"
              title="复制回复"
            >
              {copied ? (
                <>
                  <Check className="h-2.5 w-2.5 text-green-500 stroke-[2.5]" />
                  <span className="text-green-500 font-semibold">已复制</span>
                </>
              ) : copyFailed ? (
                <>
                  <X className="h-2.5 w-2.5 text-red-500" />
                  <span className="text-rose-500 font-semibold">失败</span>
                </>
              ) : (
                <>
                  <Copy className="h-2.5 w-2.5" />
                  <span>复制</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
