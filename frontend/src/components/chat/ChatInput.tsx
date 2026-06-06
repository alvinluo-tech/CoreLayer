import { useState, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';

const MAX_MESSAGE_LENGTH = 4000;

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState('');

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed.slice(0, MAX_MESSAGE_LENGTH));
    setText('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isTextEmpty = !text.trim();

  return (
    <div
      className="flex items-center gap-2.5 w-full h-11 px-4 rounded-xl transition-all duration-300"
      style={{
        border: '1px solid var(--glass-border)',
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? 'Jarvis is processing...' : 'Send a message...'}
        disabled={disabled}
        maxLength={MAX_MESSAGE_LENGTH}
        className="w-full bg-transparent text-sm focus:outline-none disabled:cursor-not-allowed"
        style={{
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)',
          letterSpacing: 0.3,
        }}
      />
      <button
        onClick={handleSend}
        disabled={isTextEmpty || disabled}
        className="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 shrink-0 disabled:cursor-not-allowed"
        style={{
          border: `1px solid ${isTextEmpty || disabled ? 'var(--glass-border)' : 'rgba(0,212,255,0.15)'}`,
          background: isTextEmpty || disabled ? 'transparent' : 'rgba(0,212,255,0.06)',
          color: isTextEmpty || disabled ? 'var(--text-tertiary)' : 'var(--cyan)',
        }}
        onMouseEnter={(e) => {
          if (!isTextEmpty && !disabled) {
            e.currentTarget.style.borderColor = 'var(--cyan)';
            e.currentTarget.style.background = 'rgba(0,212,255,0.12)';
            e.currentTarget.style.boxShadow = '0 0 12px var(--cyan-glow)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isTextEmpty && !disabled) {
            e.currentTarget.style.borderColor = 'rgba(0,212,255,0.15)';
            e.currentTarget.style.background = 'rgba(0,212,255,0.06)';
            e.currentTarget.style.boxShadow = 'none';
          }
        }}
      >
        <Send className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
