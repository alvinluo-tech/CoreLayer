import { useState, useEffect, useCallback } from 'react';
import { Pause, Play } from 'lucide-react';
import type { WorkspaceDetail } from '@/lib/apiSchemas';
import { WorkspaceTaskGraph } from './WorkspaceTaskGraph';
import { WorkspaceTimeline } from './WorkspaceTimeline';
import { WorkspaceChat } from './WorkspaceChat';
import { jarvisClient } from '@/lib/jarvisClient';

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
  }, [detail.activeProjectId, detail.projects]);

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

  // Mock but realistic cost/tokens metrics
  const completed = detail.summary?.completedTasks ?? 0;
  const mockInput = completed * 15400 + 8200;
  const mockOutput = completed * 4100 + 2100;
  const mockTotal = mockInput + mockOutput;
  const mockCost = ((mockInput * 0.015 + mockOutput * 0.075) / 1000).toFixed(2);
  const formattedDate = new Date(detail.createdAt).toLocaleDateString();

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
              📋 Spec
            </button>
            <button className="btn btn-primary" onClick={onShowProposal}>
              🤖 Proposal
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
        {/* Token bar */}
        <div className="ws-token-bar">
          <span className="ws-token-item">
            Started <span className="ws-token-value">{formattedDate}</span>
          </span>
          <span className="ws-token-item">
            Progress <span className="ws-token-value">{progress}%</span>
          </span>
          <span className="ws-token-item">
            Tokens <span className="ws-token-value">{mockTotal.toLocaleString()}</span>
          </span>
          <span className="ws-token-item">
            Cost <span className="ws-token-value">${mockCost}</span>
          </span>
          <span className="ws-token-item">
            In <span className="ws-token-value">{mockInput.toLocaleString()}</span>
          </span>
          <span className="ws-token-item">
            Out <span className="ws-token-value">{mockOutput.toLocaleString()}</span>
          </span>
        </div>
      </div>

      {/* Task Graph */}
      <div className="task-tree" style={{ maxHeight: 280, overflowY: 'auto', flexShrink: 0 }}>
        <div className="task-tree-title">Task Graph ({tasks.length})</div>
        <WorkspaceTaskGraph tasks={tasks} onRetry={handleRetryTask} />
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
        style={{ height: 180, display: 'flex', flexDirection: 'column' }}
      >
        <div className="chat-embed-header mb-1">Workspace Chat</div>
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
