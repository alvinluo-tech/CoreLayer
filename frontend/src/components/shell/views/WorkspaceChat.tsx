import { useState } from 'react';
import { Send, Bot, User } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface WorkspaceChatProps {
  messages: ChatMessage[];
  onSend: (message: string) => void;
}

export function WorkspaceChat({ messages, onSend }: WorkspaceChatProps) {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  };

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: '1px solid var(--glass-border)' }}
      >
        <div
          style={{
            width: 3,
            height: 14,
            borderRadius: 2,
            background: 'var(--cyan)',
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-hud)',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          Workspace Chat
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 agents-scroll">
        {messages.length === 0 ? (
          <div
            className="flex items-center justify-center py-8"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-data)', fontSize: 11 }}
          >
            Start a conversation about this workspace
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className="flex items-start gap-2"
                style={{
                  flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    background:
                      msg.role === 'user' ? 'rgba(0,212,255,0.1)' : 'rgba(139,92,246,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {msg.role === 'user' ? (
                    <User size={12} style={{ color: 'var(--cyan)' }} />
                  ) : (
                    <Bot size={12} style={{ color: 'var(--violet)' }} />
                  )}
                </div>
                <div
                  style={{
                    maxWidth: '80%',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 8,
                    padding: '6px 10px',
                    fontFamily: 'var(--font-body)',
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderTop: '1px solid var(--glass-border)' }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask about this workspace..."
          style={{
            flex: 1,
            fontFamily: 'var(--font-data)',
            fontSize: 12,
            color: 'var(--text-primary)',
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 6,
            padding: '6px 10px',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          style={{
            color: input.trim() ? 'var(--cyan)' : 'var(--text-tertiary)',
            background: input.trim() ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${input.trim() ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: 6,
            padding: '6px 10px',
            cursor: input.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
