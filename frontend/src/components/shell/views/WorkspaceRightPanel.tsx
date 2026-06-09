import { useState } from 'react';
import { Bot, Play, AlertTriangle } from 'lucide-react';
import type { WorkspaceDetail } from '@/lib/apiSchemas';

interface WorkspaceRightPanelProps {
  detail: WorkspaceDetail;
}

const tabs = ['Agents', 'Runs', 'Files', 'Artifacts'] as const;
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

export function WorkspaceRightPanel({ detail }: WorkspaceRightPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Agents');

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
            style={{
              flex: 1,
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-tertiary)',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${activeTab === tab ? 'var(--cyan)' : 'transparent'}`,
              padding: '8px 4px',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-3 py-2 agents-scroll">
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

        {activeTab === 'Files' && <EmptyTab message="File tracking coming in Phase 5" />}

        {activeTab === 'Artifacts' && <EmptyTab message="Artifacts coming in Phase 5" />}
      </div>

      {/* Pending Approvals */}
      {detail.pendingApprovals.length > 0 && (
        <div className="px-3 py-2" style={{ borderTop: '1px solid var(--glass-border)' }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle size={10} style={{ color: 'var(--amber)' }} />
            <span
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                color: 'var(--amber)',
              }}
            >
              Pending Approvals
            </span>
          </div>
          {detail.pendingApprovals.map((approval) => (
            <div
              key={approval.id}
              className="flex items-center gap-2 px-2 py-1.5 mb-1"
              style={{
                borderRadius: 6,
                background: 'rgba(255,184,0,0.05)',
                border: '1px solid rgba(255,184,0,0.15)',
              }}
            >
              <div className="flex-1 min-w-0">
                <div
                  className="truncate"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {approval.toolName}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 9,
                    color: 'var(--text-tertiary)',
                  }}
                >
                  Risk: {approval.risk}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
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
