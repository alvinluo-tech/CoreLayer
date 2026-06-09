import { useState, useCallback } from 'react';
import { Search, Plus, FolderKanban, Trash2, X, CheckSquare } from 'lucide-react';
import { WorkspaceCard } from './WorkspaceCard';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useWorkspaceDetailStore } from '@/stores/workspaceDetailStore';

interface WorkspaceSidebarProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

export function WorkspaceSidebar({ selectedId, onSelect, onCreate }: WorkspaceSidebarProps) {
  const { workspaces, deleteWorkspace, deleteWorkspaces } = useWorkspaceStore();
  const { fetchDetail } = useWorkspaceDetailStore();
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);

  const filtered = workspaces.filter((w) => w.name.toLowerCase().includes(search.toLowerCase()));

  const handleSelect = (id: string) => {
    onSelect(id);
    fetchDetail(id);
  };

  const handleDelete = async (id: string) => {
    const ws = workspaces.find((w) => w.id === id);
    if (!ws) return;
    if (!window.confirm(`Delete workspace "${ws.name}"? This cannot be undone.`)) return;
    await deleteWorkspace(id);
  };

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
    if (
      !window.confirm(
        `Delete ${selectedIds.size} workspace${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`
      )
    ) {
      return;
    }
    await deleteWorkspaces(Array.from(selectedIds));
    setSelectedIds(new Set());
    setIsMultiSelectMode(false);
  };

  const exitMultiSelect = () => {
    setSelectedIds(new Set());
    setIsMultiSelectMode(false);
  };

  return (
    <div
      className="flex flex-col"
      style={{
        width: 260,
        flexShrink: 0,
        borderRight: '1px solid var(--glass-border)',
        background: 'rgba(4,6,14,0.6)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5"
        style={{ borderBottom: '1px solid var(--glass-border)' }}
      >
        <span
          style={{
            fontFamily: 'var(--font-hud)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '2px',
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
          }}
        >
          Workspaces
        </span>
        <div className="flex items-center gap-1">
          {isMultiSelectMode ? (
            <>
              {selectedIds.size > 0 && (
                <button
                  className="workspace-action-btn"
                  onClick={handleBatchDelete}
                  title={`Delete ${selectedIds.size} selected`}
                  style={{ color: '#ff3d5a' }}
                >
                  <Trash2 size={14} />
                </button>
              )}
              <button
                className="workspace-action-btn"
                onClick={exitMultiSelect}
                title="Cancel selection"
              >
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              {workspaces.length > 1 && (
                <button
                  className="workspace-action-btn"
                  onClick={() => setIsMultiSelectMode(true)}
                  title="Select multiple"
                >
                  <CheckSquare size={14} />
                </button>
              )}
              <button className="workspace-action-btn" onClick={onCreate} title="New Workspace">
                <Plus size={14} />
              </button>
            </>
          )}
        </div>
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

      {/* Batch delete toolbar */}
      {isMultiSelectMode && selectedIds.size > 0 && (
        <div
          className="mx-3 mb-2 flex items-center justify-between px-3 py-2 rounded-lg"
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
            Selected {selectedIds.size}
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
            Delete
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 workspace-scroll">
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
                isMultiSelected={isMultiSelectMode && selectedIds.has(ws.id)}
                onSelect={isMultiSelectMode ? toggleMultiSelect : handleSelect}
                onDelete={isMultiSelectMode ? undefined : handleDelete}
                onToggleSelect={isMultiSelectMode ? toggleMultiSelect : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
