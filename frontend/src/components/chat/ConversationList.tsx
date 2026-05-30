import { useEffect, useState } from "react";
import { Plus, Search, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConversationItem } from "./ConversationItem";
import { useConversationStore } from "@/stores/conversationStore";

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

  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const filtered = searchQuery.trim()
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : conversations;

  const handleNewChat = async () => {
    await createConversation();
  };

  const handleDelete = async (id: string) => {
    if (confirm("确定删除这个对话吗？")) {
      await deleteConversation(id);
    }
  };

  return (
    <div className="space-y-2">
      {/* New Chat Button */}
      <Button
        variant="outline"
        className="w-full justify-start gap-2 text-sm"
        onClick={handleNewChat}
      >
        <Plus className="h-4 w-4" />
        新建对话
      </Button>

      {/* Search */}
      {conversations.length > 3 && (
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索对话..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-7 pr-2 text-sm bg-transparent border border-input rounded-md placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-destructive text-center py-2">{error}</p>
      )}

      {/* Conversation List */}
      <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
        {isLoading && conversations.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">加载中...</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-xs">{searchQuery ? "没有匹配的对话" : "还没有对话"}</p>
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
