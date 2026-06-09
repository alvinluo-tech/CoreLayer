import { RotateCcw } from 'lucide-react';

interface Task {
  id: string;
  title: string;
  status: string;
  assignedAgentId?: string | null;
  dependencies?: string[];
}

interface WorkspaceTaskGraphProps {
  tasks: Task[];
  onRetry?: (taskId: string) => void;
}

const statusColors: Record<string, string> = {
  draft: 'var(--text-tertiary)',
  queued: 'var(--text-tertiary)',
  running: 'var(--cyan)',
  blocked: 'var(--amber)',
  failed: 'var(--rose)',
  completed: 'var(--emerald)',
  done: 'var(--emerald)',
  cancelled: 'var(--text-tertiary)',
  pending: 'var(--text-tertiary)',
  in_progress: 'var(--cyan)',
};

export function WorkspaceTaskGraph({ tasks, onRetry }: WorkspaceTaskGraphProps) {
  if (tasks.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-6 gap-2"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <span style={{ fontFamily: 'var(--font-data)', fontSize: 11 }}>
          No tasks yet — Workspace is being planned...
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1" style={{ maxHeight: 280, overflowY: 'auto' }}>
      {tasks.map((task, i) => {
        const color = statusColors[task.status] ?? 'var(--text-tertiary)';
        return (
          <div key={task.id} className="flex flex-col mb-1">
            <div className="task-item flex items-center gap-2 px-2 py-1.5">
              <span
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 10,
                  color: 'var(--text-tertiary)',
                  width: 16,
                  textAlign: 'right',
                  flexShrink: 0,
                }}
              >
                {i + 1}.
              </span>
              <div className="flex-1 min-w-0">
                <div
                  className="truncate"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {task.title}
                </div>
              </div>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: color,
                  flexShrink: 0,
                  boxShadow: task.status === 'running' ? `0 0 4px ${color}66` : 'none',
                  animation: task.status === 'running' ? 'pulse 1.5s infinite' : 'none',
                }}
              />
              <span
                className={`status-badge status-${task.status}`}
                style={{ fontSize: 8, padding: '1px 5px' }}
              >
                {task.status}
              </span>
              {task.status === 'failed' && onRetry && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetry(task.id);
                  }}
                  className="btn-retry"
                  title="Retry Task"
                >
                  <RotateCcw size={10} /> Retry
                </button>
              )}
            </div>
            {task.dependencies && task.dependencies.length > 0 && (
              <div
                className="task-dep"
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 9,
                  color: 'var(--text-tertiary)',
                  marginLeft: 24,
                  marginBottom: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span className="task-dep-line" style={{ color: 'rgba(0, 212, 255, 0.15)' }}>
                  │
                </span>
                depends on:{' '}
                {task.dependencies.map((depId, idx) => {
                  const depTask = tasks.find((t) => t.id === depId);
                  const depColor = depTask
                    ? (statusColors[depTask.status] ?? 'var(--text-tertiary)')
                    : 'var(--text-tertiary)';
                  return (
                    <span key={depId}>
                      <span style={{ color: depColor }}>{depTask ? depTask.title : depId}</span>
                      {idx < (task.dependencies?.length || 0) - 1 ? ', ' : ''}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
