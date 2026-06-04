import { useState, useEffect, useRef } from 'react';

interface ThinkingDisplayProps {
  text: string;
  isStreaming: boolean;
}

export function ThinkingDisplay({ text, isStreaming }: ThinkingDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Auto-expand when thinking starts
  useEffect(() => {
    if (text && !isExpanded) {
      setIsExpanded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // Auto-collapse after streaming completes
  useEffect(() => {
    if (!isStreaming && isExpanded) {
      const timer = setTimeout(() => setIsExpanded(false), 1500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming]);

  if (!text) return null;

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span>{isStreaming ? '思考中...' : '思考过程'}</span>
        {isStreaming && (
          <span className="inline-block w-1.5 h-1.5 bg-zinc-400 rounded-full animate-pulse" />
        )}
      </button>
      {isExpanded && (
        <div
          ref={contentRef}
          className="mt-1 pl-4 text-xs text-zinc-500 italic leading-relaxed max-h-40 overflow-y-auto"
        >
          {text}
        </div>
      )}
    </div>
  );
}
