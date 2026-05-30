import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Brain, ChevronDown, ChevronUp, Check, Copy, Loader2, CheckCircle2 } from "lucide-react";
import { Streamdown } from "streamdown";

interface Message {
  id: string;
  role: "user" | "assistant";
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
    const thought = (match[1] || "").trim();
    const rest = content.replace(thoughtRegex, "").trim();
    return { thought, content: rest, isThoughtClosed: !!match[2] };
  }

  return { thought: null, content, isThoughtClosed: true };
}


export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const { thought, content: cleanContent, isThoughtClosed } = parseThoughtAndContent(message.content);
  
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
      console.error("Failed to copy text", err);
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 2000);
    }
  };

  return (
    <div className={cn("flex w-full group/bubble my-4", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-4 py-3 text-sm shadow-sm transition-all duration-300 relative border",
          isUser
            ? "bg-primary text-primary-foreground border-primary/20 rounded-br-none"
            : "bg-card text-card-foreground border-border rounded-bl-none hover:shadow-md",
        )}
      >
        {/* User Message Rendering */}
        {isUser ? (
          <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        ) : (
          <div className="space-y-3">
            {/* 1. Reasoning/Thought Process Card (Premium fold effect) */}
            {thought && (
              <div
                className={cn(
                  "rounded-lg border transition-all duration-300 overflow-hidden",
                  isThoughtClosed
                    ? "border-border bg-muted/30"
                    : "border-purple-500/30 bg-purple-500/5",
                )}
              >
                {/* Header bar */}
                <button
                  onClick={() => setIsThoughtExpanded(!isThoughtExpanded)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isThoughtClosed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Brain className="h-3.5 w-3.5 text-purple-500 animate-spin-slow" />
                    )}
                    <span>
                      {isThoughtClosed ? "已完成思考过程" : "Jarvis 正在思考推理..."}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] opacity-75">
                      {isThoughtExpanded ? "折叠" : "展开"}
                    </span>
                    {isThoughtExpanded ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </div>
                </button>

                {/* Thought text area */}
                {isThoughtExpanded && (
                  <div className="px-3 pb-3 pt-1 text-xs text-muted-foreground/90 border-t border-border/20 leading-relaxed font-mono whitespace-pre-wrap bg-muted/10">
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
              <div className="relative leading-relaxed prose prose-sm dark:prose-invert max-w-none markdown-body">
                <Streamdown
                  key={message.isStreaming && isThoughtClosed ? "streaming" : "static"}
                  mode={message.isStreaming && isThoughtClosed ? "streaming" : "static"}
                  parseIncompleteMarkdown={true}
                >
                  {cleanContent}
                </Streamdown>
              </div>
            ) : (
              message.isStreaming && !thought && (
                <div className="flex items-center gap-2 text-muted-foreground py-1">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="animate-pulse text-xs">正在准备回复...</span>
                </div>
              )
            )}

            {/* 3. Streaming/Saved Tool Calls execution visual blocks */}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/40 space-y-1.5">
                {message.toolCalls.map((tc, i) => {
                  const isPending = message.isStreaming && tc.result === null;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center justify-between gap-3 px-3 py-1.5 rounded-md border text-xs font-mono transition-colors",
                        isPending
                          ? "bg-amber-500/5 border-amber-500/20 text-amber-600 dark:text-amber-400"
                          : "bg-muted/40 border-border/40 text-muted-foreground",
                      )}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        {isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        )}
                        <span className="font-semibold text-foreground/80">调用工具:</span>
                        <span className="truncate opacity-90">{tc.name}</span>
                      </div>
                      
                      {Boolean(tc.args) && (
                        <span className="text-[10px] opacity-60 truncate max-w-[40%]">
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
        <div className="flex items-center justify-between gap-4 mt-2 pt-1 border-t border-border/10">
          <time className="text-[10px] text-muted-foreground/60 select-none">
            {message.timestamp.toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>

          {/* Copy button that shows up on hover */}
          {!isUser && !message.isStreaming && (
            <button
              onClick={handleCopyText}
              className="text-[10px] text-muted-foreground/60 hover:text-foreground flex items-center gap-1 opacity-0 group-hover/bubble:opacity-100 transition-opacity duration-200 cursor-pointer"
              title="复制回复"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-green-500" />
                  <span className="text-green-500">已复制</span>
                </>
              ) : copyFailed ? (
                <>
                  <Copy className="h-3 w-3 text-red-400" />
                  <span className="text-red-400">复制失败</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
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
