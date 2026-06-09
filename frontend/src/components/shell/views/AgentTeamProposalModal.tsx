import { X, Bot, AlertTriangle, ShieldCheck } from 'lucide-react';

interface ProposedAgent {
  id: string;
  name: string;
  role: string;
  reason: string;
  risk: 'low' | 'medium' | 'high';
  permissions: string[];
}

interface AgentTeamProposalModalProps {
  agents: ProposedAgent[];
  warnings: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

const riskColors: Record<string, { bg: string; border: string; text: string }> = {
  low: { bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.2)', text: 'var(--emerald)' },
  medium: { bg: 'rgba(255,184,0,0.08)', border: 'rgba(255,184,0,0.2)', text: 'var(--amber)' },
  high: { bg: 'rgba(244,63,94,0.08)', border: 'rgba(244,63,94,0.2)', text: 'var(--rose)' },
};

const defaultRisk = {
  bg: 'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.06)',
  text: 'var(--text-tertiary)',
};

function getRiskStyle(risk: string) {
  return riskColors[risk] ?? defaultRisk;
}

const roleColors: Record<string, string> = {
  planner: 'var(--violet)',
  coding: 'var(--cyan)',
  review: 'var(--emerald)',
  testing: 'var(--amber)',
  research: '#f472b6',
  general: 'var(--text-tertiary)',
};

export function AgentTeamProposalModal({
  agents,
  warnings,
  onConfirm,
  onCancel,
}: AgentTeamProposalModalProps) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--glass-border)' }}
        >
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} style={{ color: 'var(--cyan)' }} />
            <span
              style={{
                fontFamily: 'var(--font-hud)',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              Proposed Team
            </span>
          </div>
          <button
            onClick={onCancel}
            style={{
              color: 'var(--text-tertiary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Warnings */}
        {warnings && warnings.length > 0 && (
          <div
            className="mx-4 mt-3 flex items-start gap-2 px-3 py-2"
            style={{
              background: 'rgba(255,184,0,0.05)',
              border: '1px solid rgba(255,184,0,0.15)',
              borderRadius: 6,
            }}
          >
            <AlertTriangle
              size={14}
              style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 2 }}
            />
            <div className="flex flex-col gap-1">
              {warnings.map((w, i) => (
                <span
                  key={i}
                  style={{ fontFamily: 'var(--font-data)', fontSize: 11, color: 'var(--amber)' }}
                >
                  {w}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Agent cards */}
        <div
          className="flex flex-col gap-2 px-4 py-3"
          style={{ maxHeight: 400, overflowY: 'auto' }}
        >
          {agents &&
            agents.map((agent) => {
              const risk = getRiskStyle(agent.risk);
              const roleColor = roleColors[agent.role] ?? 'var(--text-tertiary)';
              return (
                <div
                  key={agent.id}
                  className="flex items-start gap-3 px-3 py-2.5"
                  style={{
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: `${roleColor}15`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Bot size={18} style={{ color: roleColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: 13,
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {agent.name}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-data)',
                          fontSize: 9,
                          color: roleColor,
                          background: `${roleColor}15`,
                          padding: '1px 5px',
                          borderRadius: 4,
                          textTransform: 'uppercase',
                        }}
                      >
                        {agent.role}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-data)',
                          fontSize: 9,
                          color: risk.text,
                          background: risk.bg,
                          border: `1px solid ${risk.border}`,
                          padding: '1px 5px',
                          borderRadius: 4,
                          textTransform: 'uppercase',
                        }}
                      >
                        {agent.risk}
                      </span>
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-data)',
                        fontSize: 11,
                        color: 'var(--text-tertiary)',
                        lineHeight: 1.4,
                      }}
                    >
                      {agent.reason}
                    </div>
                    {agent.permissions && agent.permissions.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {agent.permissions.slice(0, 4).map((p) => (
                          <span
                            key={p}
                            style={{
                              fontFamily: 'var(--font-data)',
                              fontSize: 9,
                              color: 'var(--text-tertiary)',
                              background: 'rgba(255,255,255,0.04)',
                              padding: '1px 4px',
                              borderRadius: 3,
                            }}
                          >
                            {p}
                          </span>
                        ))}
                        {agent.permissions.length > 4 && (
                          <span
                            style={{
                              fontFamily: 'var(--font-data)',
                              fontSize: 9,
                              color: 'var(--text-tertiary)',
                            }}
                          >
                            +{agent.permissions.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-4 py-3"
          style={{ borderTop: '1px solid var(--glass-border)' }}
        >
          <button
            onClick={onCancel}
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: 'var(--text-tertiary)',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 6,
              padding: '6px 14px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: 'var(--cyan)',
              background: 'rgba(0,212,255,0.08)',
              border: '1px solid rgba(0,212,255,0.15)',
              borderRadius: 6,
              padding: '6px 14px',
              cursor: 'pointer',
            }}
          >
            Confirm Team
          </button>
        </div>
      </div>
    </div>
  );
}
