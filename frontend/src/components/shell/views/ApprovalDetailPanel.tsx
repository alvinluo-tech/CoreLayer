import { AlertTriangle, Wrench } from 'lucide-react';
import { useApprovalStore, type ApprovalRequest, type ApprovalRisk } from '@/stores/approvalStore';
import { riskColors, riskLabels, formatArgs } from './approvalHelpers';

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-hud)',
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--text-tertiary)',
        letterSpacing: 1,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  );
}

function MetaLabel({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{children}</span>;
}

function MetaValue({ children }: { children: React.ReactNode }) {
  return (
    <span className="truncate" style={{ color: 'var(--text-secondary)' }}>
      {children}
    </span>
  );
}

export function BatchApprovalDetail({
  item,
}: {
  item: { type: 'batch'; runId: string; approvals: ApprovalRequest[] };
}) {
  const { approveBatch, denyBatch } = useApprovalStore();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} style={{ color: 'var(--amber)' }} />
            <span
              style={{
                fontFamily: 'var(--font-hud)',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--amber)',
              }}
            >
              Batch Approval ({item.approvals.length} items)
            </span>
          </div>
          <div
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: 'var(--text-tertiary)',
            }}
          >
            AI is requesting to execute multiple sensitive tool calls. Approving will run all tools
            concurrently and resume the conversation once.
          </div>
        </div>

        <div className="space-y-3">
          {item.approvals.map((app) => {
            const risk = (app.risk as ApprovalRisk) ?? 'low';
            return (
              <div
                key={app.id}
                className="p-3 rounded-lg"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--glass-border)',
                }}
              >
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <Wrench size={12} style={{ color: 'var(--text-secondary)' }} />
                    <span
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 12,
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {app.toolName}
                    </span>
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--font-data)',
                      fontSize: 9,
                      fontWeight: 600,
                      color: riskColors[risk],
                      background: `${riskColors[risk]}15`,
                      padding: '1px 5px',
                      borderRadius: 3,
                    }}
                  >
                    {riskLabels[risk]}
                  </span>
                </div>
                <pre
                  className="p-2 overflow-x-auto"
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 10,
                    color: 'var(--text-tertiary)',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: 4,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    maxHeight: 80,
                    overflowY: 'auto',
                  }}
                >
                  {formatArgs(app.args)}
                </pre>
              </div>
            );
          })}
        </div>
      </div>

      <div
        className="flex items-center gap-3 p-4"
        style={{ borderTop: '1px solid var(--glass-border)' }}
      >
        <button
          onClick={() => approveBatch(item.approvals.map((a) => a.id))}
          className="flex-1"
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 12,
            fontWeight: 600,
            padding: '8px 16px',
            borderRadius: 6,
            border: '1px solid rgba(255,184,0,0.4)',
            background: 'rgba(255,184,0,0.12)',
            color: 'var(--amber)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          Approve All ({item.approvals.length})
        </button>
        <button
          onClick={() => denyBatch(item.approvals.map((a) => a.id))}
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 12,
            fontWeight: 600,
            padding: '8px 16px',
            borderRadius: 6,
            border: '1px solid rgba(239,68,68,0.3)',
            background: 'rgba(239,68,68,0.08)',
            color: 'var(--red)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          Deny All
        </button>
      </div>
    </div>
  );
}

export function ApprovalDetail({ approval }: { approval: ApprovalRequest }) {
  const { approve, deny, remember } = useApprovalStore();
  const isPending = approval.status === 'pending';
  const risk = (approval.risk as ApprovalRisk) ?? 'low';

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Wrench size={16} style={{ color: 'var(--text-secondary)' }} />
          <span
            style={{
              fontFamily: 'var(--font-hud)',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            {approval.toolName}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 9,
              fontWeight: 600,
              color: riskColors[risk],
              background: `${riskColors[risk]}15`,
              padding: '2px 6px',
              borderRadius: 3,
              letterSpacing: 0.5,
            }}
          >
            {riskLabels[risk]}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color:
                approval.status === 'pending'
                  ? 'var(--amber)'
                  : approval.status === 'executing'
                    ? 'var(--cyan)'
                    : approval.status === 'succeeded' || approval.status === 'approved'
                      ? 'var(--emerald)'
                      : approval.status === 'denied' || approval.status === 'failed'
                        ? 'var(--red)'
                        : 'var(--text-tertiary)',
              textTransform: 'uppercase',
              fontWeight: 600,
              letterSpacing: 0.5,
            }}
          >
            {approval.status === 'executing' ? 'EXECUTING...' : approval.status}
          </span>
        </div>
      </div>

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: 'auto 1fr', fontFamily: 'var(--font-data)', fontSize: 11 }}
      >
        <MetaLabel>ID</MetaLabel>
        <MetaValue>{approval.id}</MetaValue>
        <MetaLabel>Run</MetaLabel>
        <MetaValue>{approval.runId.slice(0, 12)}...</MetaValue>
        <MetaLabel>Tool ID</MetaLabel>
        <MetaValue>{approval.toolId}</MetaValue>
        <MetaLabel>Source</MetaLabel>
        <MetaValue>{approval.source ?? '—'}</MetaValue>
        <MetaLabel>Created</MetaLabel>
        <MetaValue>{new Date(approval.createdAt).toLocaleString()}</MetaValue>
        {approval.decidedAt && (
          <>
            <MetaLabel>Decided</MetaLabel>
            <MetaValue>{new Date(approval.decidedAt).toLocaleString()}</MetaValue>
          </>
        )}
        {approval.expiresAt && (
          <>
            <MetaLabel>Expires</MetaLabel>
            <MetaValue>{new Date(approval.expiresAt).toLocaleString()}</MetaValue>
          </>
        )}
      </div>

      <div>
        <SectionHeader>Arguments</SectionHeader>
        <pre
          className="mt-1 p-2 overflow-x-auto"
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 11,
            color: 'var(--text-secondary)',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 6,
            border: '1px solid var(--glass-border)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {formatArgs(approval.args)}
        </pre>
      </div>

      {isPending && (
        <div className="space-y-2">
          <SectionHeader>Actions</SectionHeader>
          <div className="flex items-center gap-2">
            <button
              onClick={() => approve(approval.id)}
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 11,
                padding: '5px 14px',
                borderRadius: 6,
                border: '1px solid rgba(16,185,129,0.3)',
                background: 'rgba(16,185,129,0.08)',
                color: 'var(--emerald)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              Approve
            </button>
            <button
              onClick={() => deny(approval.id)}
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 11,
                padding: '5px 14px',
                borderRadius: 6,
                border: '1px solid rgba(239,68,68,0.3)',
                background: 'rgba(239,68,68,0.08)',
                color: 'var(--red)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              Deny
            </button>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={() => remember(approval.id, 'auto')}
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                padding: '3px 10px',
                borderRadius: 4,
                border: '1px solid var(--glass-border)',
                background: 'transparent',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              Remember: Auto-approve
            </button>
            <button
              onClick={() => remember(approval.id, 'deny')}
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                padding: '3px 10px',
                borderRadius: 4,
                border: '1px solid var(--glass-border)',
                background: 'transparent',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              Remember: Always deny
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
