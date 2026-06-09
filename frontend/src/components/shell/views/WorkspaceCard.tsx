import { FolderKanban } from 'lucide-react';

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
  };
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const statusColors: Record<string, string> = {
  draft: 'var(--text-tertiary)',
  planning: 'var(--violet)',
  running: 'var(--cyan)',
  blocked: 'var(--amber)',
  succeeded: 'var(--emerald)',
  failed: 'var(--rose)',
  cancelled: 'var(--text-tertiary)',
};

export function WorkspaceCard({ workspace, isSelected, onSelect }: WorkspaceCardProps) {
  const status = workspace.status || 'draft';
  const progress = workspace.summary?.progress ?? 0;

  return (
    <button
      className={`workspace-card w-full text-left px-3 py-2.5 ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(workspace.id)}
    >
      <div className="flex items-center gap-2 mb-1">
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            background: `${statusColors[status] ?? 'var(--text-tertiary)'}15`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <FolderKanban
            size={14}
            style={{ color: statusColors[status] ?? 'var(--text-tertiary)' }}
          />
        </div>
        <span
          className="flex-1 truncate"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 500,
            color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          {workspace.name}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 9,
            color: statusColors[status] ?? 'var(--text-tertiary)',
            background: `${statusColors[status] ?? 'var(--text-tertiary)'}15`,
            padding: '1px 5px',
            borderRadius: 4,
            textTransform: 'uppercase',
          }}
        >
          {status}
        </span>
      </div>
      {workspace.goal && (
        <div
          className="truncate ml-9"
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
          }}
        >
          {workspace.goal}
        </div>
      )}
      <div className="flex items-center gap-3 mt-1.5 ml-9">
        {workspace.summary && (
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
            }}
          >
            {workspace.summary.completedTasks}/{workspace.summary.totalTasks} tasks
          </span>
        )}
        {workspace.agents && (
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
            }}
          >
            {workspace.agents.length} agents
          </span>
        )}
        {progress > 0 && (
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: statusColors[status] ?? 'var(--text-tertiary)',
            }}
          >
            {progress}%
          </span>
        )}
      </div>
    </button>
  );
}
