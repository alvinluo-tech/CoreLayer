import { useEffect, useState } from 'react';
import { Plus, Search, MessageSquare, FolderKanban, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConversationStore } from '@/stores/conversationStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { ConversationItem } from '@/components/chat/ConversationItem';

export function ContextPane() {
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

  const { currentWorkspace, currentProject, loadWorkspaces } = useWorkspaceStore();

  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const filtered = searchQuery.trim()
    ? conversations.filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : conversations;

  const handleNewChat = async () => {
    await createConversation();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this conversation?')) {
      await deleteConversation(id);
    }
  };

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        width: 260,
        borderRight: '1px solid var(--glass-border)',
        background: 'rgba(4,6,14,0.5)',
        flexShrink: 0,
      }}
    >
      {/* Workspace / Project info */}
      {(currentWorkspace || currentProject) && (
        <div className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <div className="flex items-center gap-2">
            <FolderKanban size={12} style={{ color: 'var(--text-tertiary)' }} />
            <div className="flex-1 min-w-0">
              {currentProject ? (
                <span
                  className="block truncate"
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    letterSpacing: 0.5,
                  }}
                >
                  {currentProject.name}
                </span>
              ) : currentWorkspace ? (
                <span
                  className="block truncate"
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    letterSpacing: 0.5,
                  }}
                >
                  {currentWorkspace.name}
                </span>
              ) : null}
              {currentWorkspace && currentProject && (
                <span
                  className="block truncate"
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 9,
                    color: 'var(--text-tertiary)',
                  }}
                >
                  {currentWorkspace.name}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Chat + Search */}
      <div className="px-3 pt-3 pb-2 space-y-2">
        <Button
          variant="glass"
          className="w-full justify-start gap-2 text-xs h-8"
          onClick={handleNewChat}
        >
          <Plus size={12} />
          <span>New Chat</span>
        </Button>

        {conversations.length > 3 && (
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2"
              size={12}
              style={{ color: 'var(--text-tertiary)' }}
            />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-7 pl-8 pr-2 text-[11px] rounded-md outline-none transition-all duration-200"
              style={{
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
              }}
            />
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div
          className="mx-3 p-2 rounded-md text-[11px] text-center flex items-center justify-center gap-1.5"
          style={{
            background: 'rgba(255,61,90,0.06)',
            border: '1px solid rgba(255,61,90,0.15)',
            color: 'var(--rose)',
            fontFamily: 'var(--font-data)',
          }}
        >
          {error}
        </div>
      )}

      {/* Conversation list */}
      <div
        className="flex-1 overflow-y-auto px-1.5 pb-3"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(0,212,255,0.15) transparent',
        }}
      >
        {isLoading && conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10">
            <Loader2 size={18} className="animate-spin mb-2" style={{ color: 'var(--cyan)' }} />
            <span
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                color: 'var(--text-tertiary)',
                letterSpacing: 1,
              }}
            >
              LOADING...
            </span>
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-10 rounded-lg"
            style={{
              border: '1px dashed var(--glass-border)',
              color: 'var(--text-tertiary)',
            }}
          >
            <MessageSquare size={24} className="mb-2 opacity-20" style={{ color: 'var(--cyan)' }} />
            <p
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 11,
              }}
            >
              {searchQuery ? 'No matching conversations' : 'No conversations yet'}
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
