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
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--glass-border)' }}
      >
        <div className="flex items-center gap-2">
          <span
            style={{
              fontFamily: 'var(--font-hud)',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            {detail.name}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 9,
              color,
              background: `${color}15`,
              padding: '1px 6px',
              borderRadius: 4,
              textTransform: 'uppercase',
            }}
          >
            {status}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {(status === 'running' || status === 'planning') && (
            <button
              className="workspace-action-btn"
              style={{ color: 'var(--amber)' }}
              title="Pause"
            >
              <Pause size={14} />
            </button>
          )}
          {(status === 'draft' || status === 'blocked') && (
            <button
              className="workspace-action-btn"
              style={{ color: 'var(--emerald)' }}
              title="Start"
            >
              <Play size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Goal + Progress */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--glass-border)' }}>
        {detail.goal && (
          <div
            className="mb-2"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            {detail.goal}
          </div>
        )}
        {/* Progress bar */}
        <div className="progress-bar">
          <div
            className="progress-bar-fill"
            style={{
              width: `${progress}%`,
              background: color,
            }}
          />
        </div>
        {/* Token bar */}
        <div
          className="flex items-center gap-3 mt-1.5"
          style={{ fontFamily: 'var(--font-data)', fontSize: 9, color: 'var(--text-tertiary)' }}
        >
          <span>
            {detail.summary?.completedTasks ?? 0}/{detail.summary?.totalTasks ?? 0} tasks
          </span>
          <span>{detail.summary?.activeRuns ?? 0} active runs</span>
          {detail.summary?.blockedTasks ? (
            <span style={{ color: 'var(--amber)' }}>{detail.summary.blockedTasks} blocked</span>
          ) : null}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Task Graph */}
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <span className="hud-label" style={{ marginBottom: 8, display: 'block' }}>
            Tasks
          </span>
          <WorkspaceTaskGraph tasks={[]} />
        </div>

        {/* Timeline */}
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <span className="hud-label" style={{ marginBottom: 8, display: 'block' }}>
            Timeline
          </span>
          <WorkspaceTimeline events={[]} />
        </div>

        {/* Chat */}
        <div className="flex-1 min-h-0">
          <WorkspaceChat workspaceId={detail.id} />
        </div>
      </div>
    </div>
  );
}
