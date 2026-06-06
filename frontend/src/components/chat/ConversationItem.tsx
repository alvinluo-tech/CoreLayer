import { useState } from 'react';
import { Trash2, Pencil, Check, X } from 'lucide-react';
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

function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return `${tokens}t`;
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${(tokens / 1000000).toFixed(1)}M`;
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
        'group relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 select-none overflow-hidden',
        isActive
          ? 'border border-[rgba(0,212,255,0.15)]'
          : 'border border-transparent hover:border-[var(--glass-border)]'
      )}
      style={{
        background: isActive ? 'var(--glass-bg)' : 'transparent',
      }}
      onClick={() => onSelect(conversation.id)}
    >
      {/* Active indicator — left bar (cyan glow in Holo, white in Focus) */}
      {isActive && (
        <span
          className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full"
          style={{
            background: 'var(--cyan)',
            boxShadow: '0 0 8px var(--cyan-dim)',
          }}
        />
      )}

      {/* Icon container */}
      <div
        className="flex items-center justify-center w-7 h-7 rounded shrink-0"
        style={{
          border: `1px solid ${isActive ? 'rgba(0,212,255,0.15)' : 'var(--glass-border)'}`,
          background: 'rgba(0,212,255,0.04)',
        }}
      >
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {isDefault ? '✦' : '▸'}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 h-6 text-xs rounded px-2 focus:outline-none"
              style={{
                background: 'var(--glass-bg)',
                border: '1px solid var(--cyan)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
              }}
              autoFocus
            />
            <button
              onClick={handleRename}
              className="p-0.5 rounded transition-colors"
              style={{ color: 'var(--emerald)' }}
              title="确定"
            >
              <Check className="h-3 w-3" />
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setEditTitle(conversation.title);
              }}
              className="p-0.5 rounded transition-colors"
              style={{ color: 'var(--rose)' }}
              title="取消"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="space-y-0.5">
            <p
              className="text-xs font-medium truncate transition-colors duration-200"
              style={{
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              {conversation.title}
            </p>
            <p
              className="text-[10px] flex items-center gap-1.5"
              style={{
                fontFamily: 'var(--font-data)',
                letterSpacing: 0.5,
                color: 'var(--text-tertiary)',
              }}
            >
              <span>{formatRelativeTime(conversation.updatedAt)}</span>
              <span style={{ color: 'var(--glass-border)' }}>·</span>
              <span>{conversation.messageCount} msgs</span>
              {(conversation.promptTokens ?? 0) + (conversation.completionTokens ?? 0) > 0 && (
                <>
                  <span style={{ color: 'var(--glass-border)' }}>·</span>
                  <span>
                    {formatTokenCount(
                      (conversation.promptTokens ?? 0) + (conversation.completionTokens ?? 0)
                    )}
                  </span>
                </>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Action buttons — visible on hover */}
      {!isEditing && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            className="p-1 rounded transition-colors"
            style={{
              color: 'var(--text-tertiary)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--cyan)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-tertiary)';
            }}
            title="重命名"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(conversation.id);
            }}
            className="p-1 rounded transition-colors"
            style={{
              color: 'var(--text-tertiary)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--rose)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-tertiary)';
            }}
            title="删除"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
