import { useState, useEffect, useRef, useCallback } from 'react';
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    try {
      const resp = await jarvisClient.get<{ messages: ChatMessage[] }>(
        `/api/conversations/${conversationId}`
      );
      setMessages(resp.messages || []);
    } catch {
      // Conversation might not exist yet
    }
  }, [conversationId]);

  useEffect(() => {
    const initConversation = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resp = await jarvisClient.get<{ conversations: any[] }>('/api/conversations');
        const match = resp.conversations?.find((c) => c.workspaceId === workspaceId);
        if (match) {
          setConversationId(match.id);
        } else {
          setConversationId(null);
          setMessages([]);
        }
      } catch {
        setConversationId(null);
        setMessages([]);
      }
    };
    if (workspaceId) {
      initConversation();
    }
  }, [workspaceId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

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
    <div className="flex flex-col gap-1.5 h-full overflow-hidden">
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto workspace-scroll flex flex-col gap-1.5"
      >
        {messages.length === 0 ? (
          <div
            className="flex items-center justify-center py-4"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-data)', fontSize: 11 }}
          >
            Start a conversation about this workspace
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="chat-msg">
              <div
                className="chat-msg-icon"
                style={{
                  background:
                    msg.role === 'user' ? 'rgba(255,255,255,0.05)' : 'rgba(0,212,255,0.1)',
                  border: `1px solid ${msg.role === 'user' ? 'rgba(255,255,255,0.08)' : 'rgba(0,212,255,0.15)'}`,
                }}
              >
                {msg.role === 'user' ? '👤' : '🤖'}
              </div>
              <div className="chat-msg-text">{msg.content}</div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="chat-msg">
            <div
              className="chat-msg-icon"
              style={{
                background: 'rgba(167,139,250,0.1)',
                border: '1px solid rgba(167,139,250,0.15)',
              }}
            >
              🤖
            </div>
            <div className="chat-msg-text" style={{ color: 'var(--text-tertiary)' }}>
              Thinking...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="chat-input-row flex-shrink-0">
        <input
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Send a message to workspace agents..."
          disabled={isLoading}
        />
        <button onClick={handleSend} disabled={!input.trim() || isLoading} className="chat-send">
          Send
        </button>
      </div>
    </div>
  );
}
