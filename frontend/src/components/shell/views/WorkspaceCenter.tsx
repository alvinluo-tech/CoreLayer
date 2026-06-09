import { Pause, Play } from 'lucide-react';
import type { WorkspaceDetail } from '@/lib/apiSchemas';
import { WorkspaceTaskGraph } from './WorkspaceTaskGraph';
import { WorkspaceTimeline } from './WorkspaceTimeline';
import { WorkspaceChat } from './WorkspaceChat';

interface WorkspaceCenterProps {
  detail: WorkspaceDetail;
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

export function WorkspaceCenter({ detail }: WorkspaceCenterProps) {
  const status = detail.status || 'draft';
  const color = statusColors[status] ?? 'var(--text-tertiary)';
  const progress = detail.summary?.progress ?? 0;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header */}
      <div
        className="px-4 py-3"
        style={{
          borderBottom: '1px solid var(--glass-border)',
          background: 'rgba(10,14,26,0.6)',
        }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span
              style={{
                fontFamily: 'var(--font-body, Exo 2, sans-serif)',
                fontSize: 16,
                fontWeight: 700,
                color: '#fff',
              }}
            >
              {detail.name}
            </span>
            <span
              className="status-badge"
              style={{
                color,
                background: `${color}1a`,
              }}
            >
              <span
                className="status-dot"
                style={{
                  background: color,
                  boxShadow: status === 'running' ? `0 0 4px ${color}66` : 'none',
                  animation: status === 'running' ? 'pulse 1.5s infinite' : 'none',
                }}
              />
              {status}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {(status === 'running' || status === 'planning') && (
              <button className="btn btn-warn" title="Pause">
                <Pause size={12} /> Pause
              </button>
            )}
            {(status === 'draft' || status === 'blocked') && (
              <button className="btn btn-primary" title="Start">
                <Play size={12} /> Start
              </button>
            )}
          </div>
        </div>
        {detail.goal && (
          <div
            style={{
              fontFamily: 'var(--font-body, Exo 2, sans-serif)',
              fontSize: 12,
              color: 'rgba(255,255,255,0.45)',
              lineHeight: 1.5,
              marginBottom: 8,
            }}
          >
            {detail.goal}
          </div>
        )}
        {/* Progress bar */}
        <div className="ws-progress-bar">
          <div
            className="ws-progress-fill"
            style={{
              width: `${progress}%`,
              background: color,
            }}
          />
        </div>
        {/* Token bar */}
        <div className="ws-token-bar">
          <span className="ws-token-item">
            Tasks{' '}
            <span className="ws-token-value">
              {detail.summary?.completedTasks ?? 0}/{detail.summary?.totalTasks ?? 0}
            </span>
          </span>
          <span className="ws-token-item">
            Progress <span className="ws-token-value">{progress}%</span>
          </span>
          <span className="ws-token-item">
            Projects <span className="ws-token-value">{detail.projects?.length ?? 0}</span>
          </span>
          <span className="ws-token-item">
            Runs <span className="ws-token-value">{detail.summary?.activeRuns ?? 0}</span>
          </span>
          {detail.summary?.blockedTasks ? (
            <span className="ws-token-item">
              Blocked{' '}
              <span className="ws-token-value" style={{ color: 'var(--amber, #ffb800)' }}>
                {detail.summary.blockedTasks}
              </span>
            </span>
          ) : null}
        </div>
      </div>

      {/* Scrollable content: Task Graph + Timeline + Chat */}
      <div className="flex-1 overflow-y-auto workspace-scroll">
        {/* Task Graph */}
        <div className="task-tree">
          <div className="task-tree-title">Task Graph</div>
          <WorkspaceTaskGraph tasks={[]} />
        </div>

        {/* Timeline */}
        <div className="timeline">
          <div className="timeline-header">
            <div className="timeline-title">Timeline</div>
          </div>
          <WorkspaceTimeline events={[]} />
        </div>

        {/* Chat */}
        <div className="chat-embed">
          <div className="chat-embed-header">Workspace Chat</div>
          <WorkspaceChat workspaceId={detail.id} />
        </div>
      </div>
    </div>
  );
}
