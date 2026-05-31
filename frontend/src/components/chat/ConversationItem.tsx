import { useState } from 'react';
import { Trash2, Pencil, Check, X, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/lib/tauri';

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHour < 24) return `${diffHour} 小时前`;
  if (diffDay < 7) return `${diffDay} 天前`;
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: ConversationItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(conversation.title);
  const [showDelete, setShowDelete] = useState(false);

  const isDefault = conversation.title === '默认对话';

  const handleRename = () => {
    if (editTitle.trim() && editTitle !== conversation.title) {
      onRename(conversation.id, editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRename();
    if (e.key === 'Escape') {
      setEditTitle(conversation.title);
      setIsEditing(false);
    }
  };

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 px-3.5 py-2.5 rounded-lg cursor-pointer transition-all duration-300 select-none overflow-hidden',
        isActive
          ? 'bg-accent/60 text-accent-foreground shadow-sm border border-border/40 backdrop-blur-md'
          : 'hover:bg-accent/30 border border-transparent hover:border-border/10'
      )}
      onClick={() => onSelect(conversation.id)}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      {/* Active state indicator pill */}
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-gradient-to-b from-cyan-500 to-indigo-500 shadow-[0_0_10px_rgba(6,182,212,0.4)] animate-in fade-in zoom-in-50 duration-300" />
      )}

      <div className="flex-1 min-w-0 z-10">
        {isEditing ? (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 h-7 text-xs bg-background/50 border border-primary/45 rounded px-2 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary shadow-inner text-foreground"
              autoFocus
            />
            <button
              onClick={handleRename}
              className="p-1 hover:bg-emerald-500/20 text-emerald-500 rounded-md transition-colors"
              title="确定"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setEditTitle(conversation.title);
              }}
              className="p-1 hover:bg-rose-500/20 text-rose-500 rounded-md transition-colors"
              title="取消"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <p
                className={cn(
                  'text-sm font-medium truncate tracking-tight transition-colors duration-200',
                  isActive
                    ? 'text-foreground font-semibold'
                    : 'text-foreground/80 group-hover:text-foreground'
                )}
              >
                {conversation.title}
              </p>

              {/* Premium indicator badge for the Default Chat */}
              {isDefault && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-gradient-to-r from-cyan-500/10 to-indigo-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_8px_rgba(6,182,212,0.05)]">
                  <Sparkles className="h-2.5 w-2.5 animate-pulse" />
                  <span>核心</span>
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-500"></span>
                  </span>
                </span>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground/75 font-mono tracking-tight flex items-center gap-1.5">
              <span>{formatRelativeTime(conversation.updatedAt)}</span>
              <span className="text-muted-foreground/30">•</span>
              <span>{conversation.messageCount} 消息</span>
            </p>
          </div>
        )}
      </div>

      {/* Modern floating operations menu */}
      {!isEditing && showDelete && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 z-10 scale-95 group-hover:scale-100 pr-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            className="p-1.5 hover:bg-background/80 dark:hover:bg-zinc-800 text-muted-foreground hover:text-foreground rounded-full shadow-sm hover:shadow-md border border-transparent hover:border-border/30 transition-all duration-200 cursor-pointer"
            title="重命名"
          >
            <Pencil className="h-3 w-3" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(conversation.id);
            }}
            className="p-1.5 hover:bg-rose-500/15 dark:hover:bg-rose-950/30 text-muted-foreground hover:text-rose-500 rounded-full shadow-sm hover:shadow-md border border-transparent hover:border-rose-500/20 transition-all duration-200 cursor-pointer"
            title="删除"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
