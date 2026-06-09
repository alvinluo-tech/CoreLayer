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

export function WorkspaceTaskGraph({ tasks }: WorkspaceTaskGraphProps) {
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
          <div key={task.id} className="task-item flex items-center gap-2 px-2 py-1.5">
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
              {i + 1}
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
              {task.dependencies && task.dependencies.length > 0 && (
                <div
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 9,
                    color: 'var(--text-tertiary)',
                  }}
                >
                  depends on: {task.dependencies.length} task(s)
                </div>
              )}
            </div>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: color,
                flexShrink: 0,
              }}
            />
            {task.status === 'failed' && (
              <button
                style={{
                  color: 'var(--rose)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 2,
                }}
              >
                <RotateCcw size={12} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
