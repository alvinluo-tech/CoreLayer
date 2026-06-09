import { useState, useEffect } from 'react';
import { Bot, Play, AlertTriangle, Check, X } from 'lucide-react';
import type { WorkspaceDetail } from '@/lib/apiSchemas';
import { useApprovalStore } from '@/stores/approvalStore';

interface WorkspaceRightPanelProps {
  detail: WorkspaceDetail;
}

const tabs = ['Agents', 'Runs', 'Files', 'Artifacts', 'Approvals'] as const;
type Tab = (typeof tabs)[number];

const roleColors: Record<string, string> = {
  planner: 'var(--violet)',
  coding: 'var(--cyan)',
  review: 'var(--emerald)',
  testing: 'var(--amber)',
  research: '#f472b6',
  general: 'var(--text-tertiary)',
};

const runStatusColors: Record<string, string> = {
  queued: 'var(--text-tertiary)',
  running: 'var(--cyan)',
  succeeded: 'var(--emerald)',
  failed: 'var(--rose)',
  cancelled: 'var(--text-tertiary)',
  waiting_for_approval: 'var(--amber)',
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

  useEffect(() => {
    if (activeTab === 'Approvals') {
      fetchApprovals();
    }
  }, [activeTab, fetchApprovals]);

  const pendingApprovals = approvals.filter((a) => a.status === 'pending');

  return (
    <div
      className="flex flex-col"
      style={{
        width: 280,
        borderLeft: '1px solid var(--glass-border)',
        background: 'var(--glass-bg)',
      }}
    >
      {/* Tab bar */}
      <div className="flex" style={{ borderBottom: '1px solid var(--glass-border)' }}>
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`workspace-tab ${activeTab === tab ? 'active' : ''}`}
          >
            {tab}
            {tab === 'Approvals' && pendingApprovals.length > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 2,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--amber)',
                }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-3 py-2 workspace-scroll">
        {activeTab === 'Agents' && (
          <div className="flex flex-col gap-1.5">
            {detail.agents.length === 0 ? (
              <EmptyTab message="No agents assigned" />
            ) : (
              detail.agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center gap-2 px-2 py-1.5"
                  style={{
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      background: `${roleColors[agent.role] ?? 'var(--text-tertiary)'}15`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Bot
                      size={12}
                      style={{ color: roleColors[agent.role] ?? 'var(--text-tertiary)' }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="truncate"
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {agent.name}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-data)',
                        fontSize: 9,
                        color: 'var(--text-tertiary)',
                      }}
                    >
                      {agent.role}
                    </div>
                  </div>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background:
                        agent.status === 'running'
                          ? 'var(--cyan)'
                          : agent.status === 'completed'
                            ? 'var(--emerald)'
                            : 'var(--text-tertiary)',
                    }}
                  />
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'Runs' && (
          <div className="flex flex-col gap-1.5">
            {detail.recentRuns.length === 0 ? (
              <EmptyTab message="No runs yet" />
            ) : (
              detail.recentRuns.map((run) => (
                <div
                  key={run.id}
                  className="flex items-center gap-2 px-2 py-1.5"
                  style={{
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <Play
                    size={12}
                    style={{
                      color: runStatusColors[run.status] ?? 'var(--text-tertiary)',
                      flexShrink: 0,
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className="truncate"
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {run.agentName}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-data)',
                        fontSize: 9,
                        color: 'var(--text-tertiary)',
                      }}
                    >
                      {run.status}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'Files' && <EmptyTab message="File tracking coming soon" />}

        {activeTab === 'Artifacts' && <EmptyTab message="Artifacts coming soon" />}

        {activeTab === 'Approvals' && (
          <div className="flex flex-col gap-1.5">
            {pendingApprovals.length === 0 ? (
              <EmptyTab message="No pending approvals" />
            ) : (
              pendingApprovals.map((approval) => {
                const riskColor = riskColors[approval.risk] ?? 'var(--text-tertiary)';
                return (
                  <div key={approval.id} className="approval-card flex flex-col gap-2 px-2 py-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={12} style={{ color: riskColor, flexShrink: 0 }} />
                      <div className="flex-1 min-w-0">
                        <div
                          className="truncate"
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {approval.toolName}
                        </div>
                        <div
                          style={{
                            fontFamily: 'var(--font-data)',
                            fontSize: 9,
                            color: riskColor,
                          }}
                        >
                          Risk: {approval.risk}
                        </div>
                      </div>
                    </div>
                    {approval.preview && (
                      <div
                        style={{
                          fontFamily: 'var(--font-data)',
                          fontSize: 10,
                          color: 'var(--text-tertiary)',
                          lineHeight: 1.4,
                          maxHeight: 40,
                          overflow: 'hidden',
                        }}
                      >
                        {approval.preview}
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <button onClick={() => approve(approval.id)} className="approval-approve-btn">
                        <Check size={10} />
                        Approve
                      </button>
                      <button onClick={() => deny(approval.id)} className="approval-deny-btn">
                        <X size={10} />
                        Deny
                      </button>
                    </div>
                  </div>
                );
              })
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
