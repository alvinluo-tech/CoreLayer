import { useState, useEffect, useRef } from 'react';
import { Send, Bot, User } from 'lucide-react';
import { jarvisClient } from '@/lib/jarvisClient';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface WorkspaceChatProps {
  workspaceId: string;
}

export function WorkspaceChat({ workspaceId }: WorkspaceChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const loadMessages = async () => {
    if (!conversationId) return;
    try {
      const resp = await jarvisClient.get<{ data: ChatMessage[] }>(
        `/api/conversations/${conversationId}/messages`
      );
      setMessages(resp.data);
    } catch {
      // Conversation might not exist yet
    }
  };

  useEffect(() => {
    loadMessages();
  }, [conversationId]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    try {
      // Create conversation if needed
      let convId = conversationId;
      if (!convId) {
        const resp = await jarvisClient.post<{ data: { id: string } }>('/api/conversations', {
          title: 'Workspace Chat',
          workspaceId,
        });
        convId = resp.data.id;
        setConversationId(convId);
      }

      // Add user message
      const userResp = await jarvisClient.post<{ data: ChatMessage }>(
        `/api/conversations/${convId}/messages`,
        { role: 'user', content: userMessage }
      );
      setMessages((prev) => [...prev, userResp.data]);

      // Get assistant response
      const assistantResp = await jarvisClient.post<{ data: { content: string } }>('/api/chat', {
        message: userMessage,
        conversationId: convId,
      });

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: assistantResp.data.content,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Failed to get response. Please try again.',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 workspace-scroll">
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
                className="chat-message flex items-start gap-2"
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
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-start gap-2">
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    background: 'rgba(139,92,246,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Bot size={12} style={{ color: 'var(--violet)' }} />
                </div>
                <div
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 8,
                    padding: '6px 10px',
                    fontFamily: 'var(--font-data)',
                    fontSize: 11,
                    color: 'var(--text-tertiary)',
                  }}
                >
                  Thinking...
                </div>
              </div>
            )}
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
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Ask about this workspace..."
          disabled={isLoading}
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
          disabled={!input.trim() || isLoading}
          style={{
            color: input.trim() && !isLoading ? 'var(--cyan)' : 'var(--text-tertiary)',
            background:
              input.trim() && !isLoading ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${input.trim() && !isLoading ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: 6,
            padding: '6px 10px',
            cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
          }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
