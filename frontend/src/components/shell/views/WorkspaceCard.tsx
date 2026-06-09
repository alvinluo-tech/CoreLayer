import { Trash2 } from 'lucide-react';

interface WorkspaceCardProps {
  workspace: {
    id: string;
    name: string;
    description?: string | null;
    goal?: string | null;
    status?: string;
    summary?: {
      progress: number;
      totalTasks: number;
      completedTasks: number;
    };
    agents?: { id: string }[];
    projects?: { id: string }[];
  };
  isSelected: boolean;
  isMultiSelected?: boolean;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  onToggleSelect?: (id: string) => void;
}

const statusColorMap: Record<string, { color: string; dotClass: string }> = {
  draft: { color: 'rgba(255,255,255,0.25)', dotClass: 'dot-gray' },
  planning: { color: '#a78bfa', dotClass: 'dot-amber' },
  running: { color: '#00d4ff', dotClass: 'dot-blue' },
  blocked: { color: '#ffb800', dotClass: 'dot-amber' },
  succeeded: { color: '#00e68a', dotClass: 'dot-green' },
  failed: { color: '#ff3d5a', dotClass: 'dot-red' },
  cancelled: { color: 'rgba(255,255,255,0.25)', dotClass: 'dot-gray' },
};

export function WorkspaceCard({
  workspace,
  isSelected,
  isMultiSelected,
  onSelect,
  onDelete,
  onToggleSelect,
}: WorkspaceCardProps) {
  const status = workspace.status || 'draft';
  const statusInfo = statusColorMap[status] ?? {
    color: 'rgba(255,255,255,0.25)',
    dotClass: 'dot-gray',
  };
  const dotClass = statusInfo.dotClass;
  const progress = workspace.summary?.progress ?? 0;

  return (
    <button
      className={`workspace-card w-full text-left flex gap-2.5 items-start ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(workspace.id)}
      style={{ position: 'relative' }}
    >
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={isMultiSelected ?? false}
          onChange={(e) => {
            e.stopPropagation();
            onToggleSelect(workspace.id);
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 14,
            height: 14,
            accentColor: 'var(--cyan)',
            cursor: 'pointer',
            marginTop: 3,
            flexShrink: 0,
          }}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="ws-card-name">
          <span className={`status-badge status-${status}`}>
            <span className={`status-dot ${dotClass}`} />
            {status}
          </span>
          <span className="flex-1 min-w-0 truncate">{workspace.name}</span>
          {onDelete && (
            <span
              className="ws-card-delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(workspace.id);
              }}
              title="Delete workspace"
            >
              <Trash2 size={11} />
            </span>
          )}
        </div>
        {workspace.goal && <div className="ws-card-goal">{workspace.goal}</div>}
        <div className="ws-card-meta">
          {workspace.projects && workspace.projects.length > 0 && (
            <span className="ws-card-meta-item">{workspace.projects.length} projects</span>
          )}
          {workspace.summary && (
            <span className="ws-card-meta-item">{workspace.summary.totalTasks} tasks</span>
          )}
          {workspace.agents && (
            <span className="ws-card-meta-item">{workspace.agents.length} agents</span>
          )}
          {progress > 0 && <span className="ws-card-meta-item">{progress}%</span>}
        </div>
      </div>
    </button>
  );
}
