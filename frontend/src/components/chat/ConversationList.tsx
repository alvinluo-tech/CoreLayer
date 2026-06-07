import { useEffect, useState } from 'react';
import { Plus, Search, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConversationItem } from './ConversationItem';
import { useConversationStore } from '@/stores/conversationStore';

export function ConversationList() {
  const {
    conversations,
    activeConversationId,
    isLoading,
    error,
    fetchConversations,
    createConversation,
    selectConversation,
    deleteConversation,
    renameConversation,
  } = useConversationStore();

  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const filtered = searchQuery.trim()
    ? conversations.filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : conversations;

  const handleNewChat = async () => {
    await createConversation();
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定删除这个对话吗？')) {
      await deleteConversation(id);
    }
  };

  return (
    <div className="space-y-3">
      {/* New Chat Button */}
      <Button
        variant="glass"
        className="w-full justify-start gap-2.5 text-sm h-10 px-4 rounded-xl"
        onClick={handleNewChat}
      >
        <Plus className="h-3.5 w-3.5" />
        <span>新建对话</span>
      </Button>

      {/* Search box */}
      {conversations.length > 3 && (
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
            style={{ color: 'var(--text-tertiary)' }}
          />
          <input
            type="text"
            placeholder="搜索历史对话..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 text-xs rounded-lg outline-none transition-all duration-200"
            style={{
              background: 'var(--glass-bg)',
              border: '1px solid var(--glass-border)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
            }}
          />
        </div>
      )}

      {/* Error display */}
      {error && (
        <div
          className="p-2 rounded-lg text-xs text-center"
          style={{
            background: 'rgba(255,61,90,0.06)',
            border: '1px solid rgba(255,61,90,0.15)',
            color: 'var(--rose)',
          }}
        >
          {error}
        </div>
      )}

      {/* Conversation list */}
      <div
        className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1.5"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(0,212,255,0.15) transparent',
        }}
      >
        {isLoading && conversations.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-8"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <span
              className="h-4 w-4 rounded-full border-2 animate-spin mb-2"
              style={{ borderColor: 'rgba(0,212,255,0.15)', borderTopColor: 'var(--cyan)' }}
            />
            <p style={{ fontFamily: 'var(--font-data)', fontSize: 10, letterSpacing: 1 }}>
              LOADING SECURE STORAGE...
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-10 rounded-xl"
            style={{
              border: '1px dashed var(--glass-border)',
              color: 'var(--text-tertiary)',
            }}
          >
            <MessageSquare className="h-8 w-8 mb-2.5 opacity-20" style={{ color: 'var(--cyan)' }} />
            <p style={{ fontFamily: 'var(--font-data)', fontSize: 11 }}>
              {searchQuery ? '没有匹配的对话记录' : '暂无对话记录'}
            </p>
          </div>
        ) : (
          filtered.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === activeConversationId}
              onSelect={selectConversation}
              onDelete={handleDelete}
              onRename={renameConversation}
            />
          ))
        )}
      </div>
    </div>
  );
}
