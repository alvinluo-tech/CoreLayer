import { useState, useEffect, useCallback } from 'react';
import {
  Pause,
  Play,
  FileText,
  Bot,
  Folder,
  Clipboard,
  Zap,
  AlertTriangle,
  MessageSquare,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import type { WorkspaceDetail } from '@/lib/apiSchemas';
import { WorkspaceTaskGraph } from './WorkspaceTaskGraph';
import { WorkspaceTimeline } from './WorkspaceTimeline';
import { WorkspaceChat } from './WorkspaceChat';
import { jarvisClient } from '@/lib/jarvisClient';
import { useApprovalStore } from '@/stores/approvalStore';

interface WorkspaceCenterProps {
  detail: WorkspaceDetail;
  onShowSpec: () => void;
  onShowProposal: () => void;
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

export function WorkspaceCenter({ detail, onShowSpec, onShowProposal }: WorkspaceCenterProps) {
  const status = detail.status || 'draft';
  const color = statusColors[status] ?? 'var(--text-tertiary)';
  const progress = detail.summary?.progress ?? 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [tasks, setTasks] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [events, setEvents] = useState<any[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [chatExpanded, setChatExpanded] = useState(false);

  const { approvals, fetchApprovals } = useApprovalStore();
  const pendingApprovalsCount = approvals.filter((a) => a.status === 'pending').length;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2000);
  };

  const loadTasksAndEvents = useCallback(async () => {
    const projId = detail.activeProjectId || detail.projects[0]?.id;
    if (!projId) {
      setTasks([]);
      setEvents([]);
      return;
    }
    fetchApprovals();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tasksResp = await jarvisClient.get<{ tasks: any[] }>(`/api/tasks?projectId=${projId}`);
      setTasks(tasksResp.tasks || []);
    } catch {
      setTasks([]);
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eventsResp = await jarvisClient.get<{ events: any[] }>(
        `/api/events?projectId=${projId}`
      );
      setEvents(eventsResp.events || []);
    } catch {
      setEvents([]);
    }
  }, [detail.activeProjectId, detail.projects, fetchApprovals]);

  useEffect(() => {
    loadTasksAndEvents();
    // Poll or reload periodically if workspace status is running
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let interval: any;
    if (detail.status === 'running' || detail.status === 'planning') {
      interval = setInterval(loadTasksAndEvents, 5000);
    }
    return () => clearInterval(interval);
  }, [detail.status, loadTasksAndEvents]);

  const handleRetryTask = async (taskId: string) => {
    try {
      showToast('Retrying task...');
      await jarvisClient.post(`/api/tasks/${taskId}/start`);
      loadTasksAndEvents();
    } catch (err) {
      console.error('Failed to retry task:', err);
    }
  };

  const handlePause = () => {
    showToast('Workspace paused');
  };

  const handleStart = () => {
    showToast('Starting workspace...');
  };

  // Map backend EventLogRow to TimelineEvent shape
  const timelineEvents = events.map((e) => {
    const t = e.type.toLowerCase();
    let mappedType = 'system';
    if (t.includes('agent')) mappedType = 'agent';
    else if (t.includes('tool')) mappedType = 'tool';
    else if (t.includes('memory')) mappedType = 'memory';
    else if (t.includes('approval')) mappedType = 'approval';

    return {
      id: e.id,
      type: mappedType,
      message: e.message,
      timestamp: new Date(e.createdAt).toLocaleTimeString(),
      payload: e.payload,
    };
  });

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
            <button className="btn btn-ghost" onClick={onShowSpec}>
              <FileText size={11} style={{ marginRight: 4 }} /> Spec
            </button>
            <button className="btn btn-primary" onClick={onShowProposal}>
              <Bot size={11} style={{ marginRight: 4 }} /> Proposal
            </button>
            {(status === 'running' || status === 'planning') && (
              <button className="btn btn-warn" title="Pause" onClick={handlePause}>
                <Pause size={12} /> Pause
              </button>
            )}
            {(status === 'draft' || status === 'blocked') && (
              <button className="btn btn-primary" title="Start" onClick={handleStart}>
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

        {/* Execution Summary Bar */}
        <div
          className="flex items-center gap-4 mt-2.5 pt-2"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.03)',
            fontFamily: 'var(--font-data, Share Tech Mono, monospace)',
            fontSize: 10,
          }}
        >
          <span className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
            <Folder size={11} style={{ color: 'var(--cyan)' }} />
            Projects: <strong style={{ color: '#fff' }}>{detail.projects?.length || 0}</strong>
          </span>
          <span className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
            <Clipboard size={11} style={{ color: 'var(--violet)' }} />
            Tasks:{' '}
            <strong style={{ color: '#fff' }}>
              {detail.summary.completedTasks}/{detail.summary.totalTasks} done
            </strong>
          </span>
          <span className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
            <Zap size={11} style={{ color: 'var(--amber)' }} />
            Runs: <strong style={{ color: '#fff' }}>{detail.summary.activeRuns} active</strong>
          </span>
          <span className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
            <Bot size={11} style={{ color: 'var(--cyan)' }} />
            Agents: <strong style={{ color: '#fff' }}>{detail.agents?.length || 0} active</strong>
          </span>
          {pendingApprovalsCount > 0 && (
            <span
              className="flex items-center gap-1 px-1.5 py-0.5 rounded"
              style={{
                color: 'var(--rose)',
                background: 'rgba(244,63,94,0.08)',
                border: '1px solid rgba(244,63,94,0.18)',
              }}
            >
              <AlertTriangle size={11} style={{ color: 'var(--rose)' }} />
              <strong>
                {pendingApprovalsCount} pending approval{pendingApprovalsCount > 1 ? 's' : ''}
              </strong>
            </span>
          )}
        </div>
      </div>

      {/* Project Summary Strip */}
      {detail.projects && detail.projects.length > 0 && (
        <div
          className="px-4 py-2 flex items-center gap-2 overflow-x-auto flex-shrink-0"
          style={{
            borderBottom: '1px solid var(--glass-border)',
            background: 'rgba(4,6,14,0.15)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-hud)',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              marginRight: 4,
            }}
          >
            Projects
          </span>
          <div className="flex items-center gap-2">
            {detail.projects.map((proj) => {
              const isActive = detail.activeProjectId === proj.id;
              return (
                <div
                  key={proj.id}
                  className="flex items-center gap-2 px-2.5 py-1 rounded"
                  style={{
                    background: isActive ? 'rgba(0,212,255,0.06)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isActive ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    fontSize: 11,
                  }}
                >
                  <span
                    style={{ fontWeight: 500, color: isActive ? '#fff' : 'var(--text-secondary)' }}
                  >
                    {proj.name}
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
                    {proj.progress}%
                  </span>
                  <span
                    className={`status-badge status-${proj.status}`}
                    style={{ fontSize: 8, padding: '0.5px 4px' }}
                  >
                    {proj.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Task Graph */}
      <div className="task-tree" style={{ maxHeight: 280, overflowY: 'auto', flexShrink: 0 }}>
        <div className="task-tree-title">Task Graph ({tasks.length})</div>
        <WorkspaceTaskGraph tasks={tasks} projects={detail.projects} onRetry={handleRetryTask} />
      </div>

      {/* Timeline */}
      <div className="timeline" style={{ flex: 1, overflowY: 'auto' }}>
        <div className="timeline-header">
          <div className="timeline-title">Timeline</div>
        </div>
        <WorkspaceTimeline events={timelineEvents} />
      </div>

      {/* Chat */}
      <div
        className="chat-embed flex-shrink-0"
        style={{
          height: chatExpanded ? 360 : 180,
          display: 'flex',
          flexDirection: 'column',
          transition: 'height 0.2s ease-in-out',
        }}
      >
        <div className="chat-embed-header mb-1.5 flex items-center justify-between w-full">
          <div className="flex items-center gap-1.5">
            <MessageSquare size={10} style={{ color: 'var(--cyan)' }} />
            <span>Workspace Chat</span>
          </div>
          <button
            onClick={() => setChatExpanded((prev) => !prev)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              padding: 2,
              display: 'flex',
              alignItems: 'center',
            }}
            title={chatExpanded ? 'Collapse Chat' : 'Expand Chat'}
          >
            {chatExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>
        <div className="flex-grow flex-1 min-h-0">
          <WorkspaceChat workspaceId={detail.id} />
        </div>
      </div>

      {/* Toast message overlay */}
      {toastMessage && (
        <div
          className="toast show"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: 'rgba(0, 212, 255, 0.1)',
            border: '1px solid rgba(0, 212, 255, 0.2)',
            borderRadius: 8,
            padding: '10px 16px',
            fontFamily: 'var(--font-data, Share Tech Mono, monospace)',
            fontSize: 11,
            color: '#00d4ff',
            zIndex: 300,
          }}
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
