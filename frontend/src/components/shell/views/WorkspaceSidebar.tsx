import { useState } from 'react';
import { Search, Plus, FolderKanban } from 'lucide-react';
import { WorkspaceCard } from './WorkspaceCard';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useWorkspaceDetailStore } from '@/stores/workspaceDetailStore';

interface WorkspaceSidebarProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

export function WorkspaceSidebar({ selectedId, onSelect, onCreate }: WorkspaceSidebarProps) {
  const { workspaces } = useWorkspaceStore();
  const { fetchDetail } = useWorkspaceDetailStore();
  const [search, setSearch] = useState('');

  const filtered = workspaces.filter((w) => w.name.toLowerCase().includes(search.toLowerCase()));

  const handleSelect = (id: string) => {
    onSelect(id);
    fetchDetail(id);
  };

  return (
    <div
      className="flex flex-col"
      style={{
        width: 260,
        borderRight: '1px solid var(--glass-border)',
        background: 'var(--glass-bg)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5"
        style={{ borderBottom: '1px solid var(--glass-border)' }}
      >
        <span className="hud-label">Workspaces</span>
        <button
          onClick={onCreate}
          style={{
            color: 'var(--text-tertiary)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div
          className="flex items-center gap-2"
          style={{
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 6,
            padding: '5px 8px',
          }}
        >
          <Search size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: 'var(--text-primary)',
              background: 'none',
              border: 'none',
              outline: 'none',
              width: '100%',
            }}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 agents-scroll">
        {filtered.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-8 gap-2"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <FolderKanban size={24} style={{ opacity: 0.4 }} />
            <span style={{ fontFamily: 'var(--font-data)', fontSize: 11 }}>
              {workspaces.length === 0 ? 'No workspaces yet' : 'No matches'}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filtered.map((ws) => (
              <WorkspaceCard
                key={ws.id}
                workspace={ws}
                isSelected={ws.id === selectedId}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
