import { useState, useEffect } from 'react';
import { Bot, AlertTriangle, Check, X } from 'lucide-react';
import type { WorkspaceDetail } from '@/lib/apiSchemas';
import { useApprovalStore } from '@/stores/approvalStore';
import { jarvisClient } from '@/lib/jarvisClient';

interface WorkspaceRightPanelProps {
  detail: WorkspaceDetail;
}

const tabs = ['Agents', 'Runs', 'Projects', 'Artifacts'] as const;
type Tab = (typeof tabs)[number];

const roleColors: Record<string, string> = {
  planner: 'var(--violet)',
  coding: 'var(--cyan)',
  review: 'var(--emerald)',
  testing: 'var(--amber)',
  research: '#f472b6',
  general: 'var(--text-tertiary)',
};

const riskColors: Record<string, string> = {
  low: 'var(--emerald)',
  medium: 'var(--amber)',
  high: 'var(--rose)',
  critical: 'var(--rose)',
};

export function WorkspaceRightPanel({ detail }: WorkspaceRightPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Agents');
  const { approvals, fetchApprovals, approve, deny } = useApprovalStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [artifacts, setArtifacts] = useState<any[]>([]);

  useEffect(() => {
    if (activeTab === 'Agents') {
      fetchApprovals();
    }
  }, [activeTab, fetchApprovals]);

  useEffect(() => {
    const loadArtifacts = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resp = await jarvisClient.get<{ data: any[] }>(
          `/api/workspaces/${detail.id}/artifacts`
        );
        setArtifacts(resp.data || []);
      } catch {
        setArtifacts([]);
      }
    };
    if (detail.id && activeTab === 'Artifacts') {
      loadArtifacts();
    }
  }, [detail.id, activeTab]);

  const pendingApprovals = approvals.filter((a) => a.status === 'pending');

  return (
    <div
      className="flex flex-col"
      style={{
        width: 320,
        borderLeft: '1px solid var(--glass-border)',
        background: 'rgba(4,6,14,0.3)',
      }}
    >
      {/* Tab bar */}
      <div className="ws-right-tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`ws-right-tab ${activeTab === tab ? 'active' : ''}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="ws-right-body workspace-scroll">
        {activeTab === 'Agents' && (
          <div>
            {detail.agents.length === 0 ? (
              <EmptyTab message="No agents assigned" />
            ) : (
              detail.agents.map((agent) => (
                <div key={agent.id} className="agent-mini">
                  <div
                    className="agent-mini-icon"
                    style={{
                      background: `${roleColors[agent.role] ?? 'var(--text-tertiary)'}1a`,
                      border: `1px solid ${roleColors[agent.role] ?? 'var(--text-tertiary)'}26`,
                    }}
                  >
                    <Bot
                      size={14}
                      style={{ color: roleColors[agent.role] ?? 'var(--text-tertiary)' }}
                    />
                  </div>
                  <div className="agent-mini-info">
                    <div className="agent-mini-name">{agent.name}</div>
                    <div className="agent-mini-role">
                      {agent.role} · {agent.status}
                    </div>
                  </div>
                  <span
                    className={`status-badge status-${agent.status === 'running' ? 'running' : agent.status === 'completed' ? 'succeeded' : 'queued'}`}
                  >
                    <span
                      className={`status-dot dot-${agent.status === 'running' ? 'blue' : agent.status === 'completed' ? 'green' : 'gray'}`}
                    />
                    {agent.status}
                  </span>
                </div>
              ))
            )}
            {pendingApprovals.length > 0 && (
              <div className="mt-3">
                <div className="task-tree-title" style={{ marginBottom: 8 }}>
                  Pending Approvals
                </div>
                {pendingApprovals.map((approval) => {
                  const riskColor = riskColors[approval.risk] ?? 'var(--text-tertiary)';
                  return (
                    <div key={approval.id} className="approval-card">
                      <div className="approval-header">
                        <AlertTriangle size={14} style={{ color: riskColor }} />
                        <span className="approval-title">{approval.toolName}</span>
                        <span
                          className={`status-badge status-${approval.risk === 'high' ? 'failed' : 'blocked'}`}
                          style={{ fontSize: 8 }}
                        >
                          {approval.risk} risk
                        </span>
                      </div>
                      {approval.preview && <div className="approval-desc">{approval.preview}</div>}
                      <div className="approval-actions">
                        <button onClick={() => approve(approval.id)} className="btn btn-success">
                          <Check size={10} /> Approve
                        </button>
                        <button onClick={() => deny(approval.id)} className="btn btn-danger">
                          <X size={10} /> Deny
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'Runs' && (
          <div>
            {detail.recentRuns.length === 0 ? (
              <EmptyTab message="No runs yet" />
            ) : (
              detail.recentRuns.map((run) => {
                const duration = run.completedAt
                  ? `${Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s`
                  : 'running...';
                return (
                  <div key={run.id} className="run-card">
                    <div className="run-card-header">
                      <span className="run-card-title">{run.agentName}</span>
                      <span className={`status-badge status-${run.status}`} style={{ fontSize: 8 }}>
                        {run.status}
                      </span>
                    </div>
                    <div className="run-card-meta">
                      <span>Duration: {duration}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'Projects' && (
          <div>
            {detail.projects.length === 0 ? (
              <EmptyTab message="No projects yet" />
            ) : (
              detail.projects.map((project) => (
                <div key={project.id} className="run-card">
                  <div className="run-card-header">
                    <span className="run-card-title">{project.name}</span>
                    <span
                      className={`status-badge status-${project.status === 'active' ? 'running' : project.status === 'completed' ? 'succeeded' : 'queued'}`}
                    >
                      <span
                        className={`status-dot dot-${project.status === 'active' ? 'blue' : project.status === 'completed' ? 'green' : 'gray'}`}
                      />
                      {project.status}
                    </span>
                  </div>
                  {project.description && (
                    <div
                      style={{
                        fontFamily: 'var(--font-data)',
                        fontSize: 10,
                        color: 'var(--text-tertiary)',
                        marginTop: 4,
                      }}
                    >
                      {project.description}
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      marginTop: 6,
                      fontFamily: 'var(--font-data)',
                      fontSize: 9,
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    <span>
                      {project.completedTasks}/{project.taskCount} tasks
                    </span>
                    <span>{project.progress}%</span>
                  </div>
                  <div
                    style={{
                      height: 2,
                      background: 'rgba(255,255,255,0.06)',
                      borderRadius: 1,
                      marginTop: 6,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${project.progress}%`,
                        background:
                          project.status === 'active' ? 'var(--cyan)' : 'var(--text-tertiary)',
                        borderRadius: 1,
                        transition: 'width 0.5s',
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'Artifacts' && (
          <div className="flex flex-col gap-1.5">
            {artifacts.length === 0 ? (
              <EmptyTab message="No artifacts yet" />
            ) : (
              artifacts.map((art) => (
                <div
                  key={art.id}
                  className="artifact-card"
                  onClick={() =>
                    window.alert(`Viewing ${art.title}\nPath: ${art.path || 'no path'}`)
                  }
                >
                  <div className="artifact-header">
                    <span style={{ fontSize: 14 }}>
                      {art.type === 'spec'
                        ? '📋'
                        : art.type === 'plan'
                          ? '📊'
                          : art.type === 'file'
                            ? '📄'
                            : '✅'}
                    </span>
                    <span className="artifact-title">{art.title}</span>
                  </div>
                  <div className="artifact-meta">
                    {art.type} · {art.path || 'no path'} ·{' '}
                    {new Date(art.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyTab({ message }: { message: string }) {
  return (
    <div
      className="flex items-center justify-center py-6"
      style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-data)', fontSize: 11 }}
    >
      {message}
    </div>
  );
}
