import { useState } from 'react';
import { AlertTriangle, Check, X, Loader2 } from 'lucide-react';
import { riskColors, riskLabels, formatArgs } from '@/components/shell/views/approvalHelpers';
import type { PendingApproval } from '@/hooks/useChat';

interface InlineApprovalCardProps {
  approvals: PendingApproval[];
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}

export function InlineApprovalCard({ approvals, onApprove, onDeny }: InlineApprovalCardProps) {
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      await onApprove(id);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeny = async (id: string) => {
    setProcessingId(id);
    try {
      await onDeny(id);
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveAll = async () => {
    for (const approval of approvals) {
      await handleApprove(approval.id);
    }
  };

  const handleDenyAll = async () => {
    for (const approval of approvals) {
      await handleDeny(approval.id);
    }
  };

  return (
    <div className="flex justify-start my-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div
        className="max-w-[85%] rounded-2xl rounded-tl-sm overflow-hidden transition-all duration-200"
        style={{
          border: '1px solid rgba(255,184,0,0.2)',
          background: 'linear-gradient(135deg, rgba(255,184,0,0.05), rgba(255,120,0,0.03))',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-4 py-2.5"
          style={{ borderBottom: '1px solid rgba(255,184,0,0.12)' }}
        >
          <span className="relative flex h-2 w-2">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{ background: 'var(--amber)' }}
            />
            <span
              className="relative inline-flex rounded-full h-2 w-2"
              style={{ background: 'var(--amber)' }}
            />
          </span>
          <span
            style={{
              fontFamily: 'var(--font-hud)',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 2,
              color: 'var(--amber)',
            }}
          >
            AWAITING APPROVAL
          </span>
          {approvals.length > 1 && (
            <span
              className="px-1.5 py-0.5 rounded text-[9px]"
              style={{
                fontFamily: 'var(--font-data)',
                background: 'rgba(255,184,0,0.1)',
                color: 'var(--amber)',
              }}
            >
              {approvals.length} items
            </span>
          )}
        </div>

        {/* Approval items */}
        <div className="px-4 py-3 space-y-3">
          {approvals.map((approval) => (
            <div
              key={approval.id}
              className="rounded-lg p-3 space-y-2"
              style={{
                background: 'rgba(0,0,0,0.15)',
                border: '1px solid var(--glass-border)',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle
                    className="h-3.5 w-3.5"
                    style={{ color: riskColors[approval.risk] ?? 'var(--amber)' }}
                  />
                  <span className="font-semibold text-xs" style={{ color: 'var(--text-primary)' }}>
                    {approval.toolName}
                  </span>
                  <span
                    className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                    style={{
                      fontFamily: 'var(--font-data)',
                      background: `${riskColors[approval.risk] ?? 'var(--amber)'}20`,
                      color: riskColors[approval.risk] ?? 'var(--amber)',
                      border: `1px solid ${riskColors[approval.risk] ?? 'var(--amber)'}30`,
                    }}
                  >
                    {riskLabels[approval.risk] ?? approval.risk.toUpperCase()}
                  </span>
                </div>
              </div>

              {approval.args != null && (
                <div
                  className="text-[10px] px-2 py-1.5 rounded truncate"
                  style={{
                    fontFamily: 'var(--font-data)',
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  {formatArgs(approval.args)}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => handleApprove(approval.id)}
                  disabled={processingId !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    fontFamily: 'var(--font-hud)',
                    background: 'rgba(16,185,129,0.1)',
                    border: '1px solid rgba(16,185,129,0.3)',
                    color: 'var(--emerald)',
                  }}
                >
                  {processingId === approval.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  Approve
                </button>
                <button
                  onClick={() => handleDeny(approval.id)}
                  disabled={processingId !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    fontFamily: 'var(--font-hud)',
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    color: 'var(--red)',
                  }}
                >
                  {processingId === approval.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Batch actions */}
        {approvals.length > 1 && (
          <div
            className="flex items-center gap-2 px-4 py-2.5"
            style={{ borderTop: '1px solid rgba(255,184,0,0.12)' }}
          >
            <button
              onClick={handleApproveAll}
              disabled={processingId !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                fontFamily: 'var(--font-hud)',
                background: 'rgba(16,185,129,0.15)',
                border: '1px solid rgba(16,185,129,0.4)',
                color: 'var(--emerald)',
              }}
            >
              <Check className="h-3 w-3" />
              Approve All
            </button>
            <button
              onClick={handleDenyAll}
              disabled={processingId !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                fontFamily: 'var(--font-hud)',
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.4)',
                color: 'var(--red)',
              }}
            >
              <X className="h-3 w-3" />
              Deny All
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
