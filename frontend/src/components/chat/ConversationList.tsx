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
      {/* Premium New Chat Button */}
      <Button
        variant="outline"
        className="w-full justify-start gap-2.5 text-sm h-10 px-4 rounded-xl border border-primary/15 bg-gradient-to-r from-primary/5 to-indigo-500/5 hover:from-primary/10 hover:to-indigo-500/10 hover:border-primary/30 transition-all duration-300 transform hover:scale-[1.01] active:scale-[0.98] shadow-sm shadow-primary/5 hover:shadow-md cursor-pointer font-medium group"
        onClick={handleNewChat}
      >
        <div className="flex items-center justify-center w-5 h-5 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 group-hover:scale-105 transition-all duration-300">
          <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
        </div>
        <span className="text-foreground/80 group-hover:text-foreground font-semibold transition-colors">
          新建对话
        </span>
      </Button>

      {/* Search box with dynamic scale & glow */}
      {conversations.length > 3 && (
        <div className="relative group/search animate-in fade-in duration-300">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 group-focus-within/search:text-primary transition-colors duration-200" />
          <input
            type="text"
            placeholder="搜索历史对话..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 text-xs bg-accent/15 border border-border/40 hover:border-border/60 focus:border-primary/45 rounded-lg placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/20 focus:bg-background/80 transition-all duration-300 shadow-inner text-foreground"
          />
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs text-center animate-in fade-in duration-200">
          {error}
        </div>
      )}

      {/* Conversation list with ultra-premium sleek scrollbar */}
      <div
        className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1.5"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(156, 163, 175, 0.2) transparent',
        }}
      >
        {isLoading && conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/50">
            <span className="h-4 w-4 rounded-full border-2 border-primary/20 border-t-primary animate-spin mb-2" />
            <p className="text-[11px] font-mono tracking-wider">LOADING SECURE STORAGE...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/50 border border-dashed border-border/30 rounded-xl bg-accent/5">
            <MessageSquare className="h-8 w-8 mb-2.5 opacity-30 stroke-[1.5] text-primary animate-pulse" />
            <p className="text-xs font-medium">
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
