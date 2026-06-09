import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, MessageSquare, Trash2, X } from 'lucide-react';
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
    deleteConversations,
    renameConversation,
  } = useConversationStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);

  const toggleMultiSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定删除 ${selectedIds.size} 个对话记录吗？此操作不可撤销。`)) {
      return;
    }
    await deleteConversations(Array.from(selectedIds));
    setSelectedIds(new Set());
    setIsMultiSelectMode(false);
  };

  const exitMultiSelect = () => {
    setSelectedIds(new Set());
    setIsMultiSelectMode(false);
  };

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
      {/* New Chat Button + Multi-select toggle */}
      <div className="flex gap-2">
        <Button
          variant="glass"
          className="flex-1 justify-start gap-2.5 text-sm h-10 px-4 rounded-xl"
          onClick={handleNewChat}
        >
          <Plus className="h-3.5 w-3.5" />
          <span>新建对话</span>
        </Button>
        {conversations.length > 1 && (
          <Button
            variant="glass"
            className="h-10 px-3 rounded-xl shrink-0"
            onClick={() => {
              if (isMultiSelectMode) {
                exitMultiSelect();
              } else {
                setIsMultiSelectMode(true);
              }
            }}
            title={isMultiSelectMode ? '取消选择' : '批量选择'}
          >
            {isMultiSelectMode ? <X className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>

      {/* Batch delete toolbar */}
      {isMultiSelectMode && selectedIds.size > 0 && (
        <div
          className="flex items-center justify-between px-3 py-2 rounded-lg"
          style={{
            background: 'rgba(255,61,90,0.06)',
            border: '1px solid rgba(255,61,90,0.15)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: 'var(--rose)',
            }}
          >
            已选择 {selectedIds.size} 个
          </span>
          <button
            onClick={handleBatchDelete}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors"
            style={{
              fontFamily: 'var(--font-data)',
              color: 'var(--rose)',
              background: 'rgba(255,61,90,0.1)',
              border: '1px solid rgba(255,61,90,0.2)',
            }}
          >
            <Trash2 size={11} />
            删除
          </button>
        </div>
      )}

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
              isMultiSelected={isMultiSelectMode && selectedIds.has(conv.id)}
              onSelect={isMultiSelectMode ? (id) => toggleMultiSelect(id) : selectConversation}
              onDelete={isMultiSelectMode ? undefined : handleDelete}
              onRename={isMultiSelectMode ? undefined : renameConversation}
              onToggleSelect={isMultiSelectMode ? toggleMultiSelect : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}
