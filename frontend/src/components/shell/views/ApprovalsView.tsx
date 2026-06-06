import { useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Wrench,
  Loader2,
} from 'lucide-react';
import {
  useApprovalStore,
  type ApprovalRequest,
  type ApprovalRisk,
  type ApprovalFilterStatus,
} from '@/stores/approvalStore';
import { useShellStore } from '@/stores/shellStore';

// ---- Helpers ----

const riskColors: Record<ApprovalRisk, string> = {
  low: 'var(--text-tertiary)',
  medium: 'var(--amber)',
  high: 'var(--red)',
  critical: 'var(--red)',
};

const riskLabels: Record<ApprovalRisk, string> = {
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
  critical: 'CRITICAL',
};

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function formatArgs(args: unknown): string {
  if (!args) return '';
  if (typeof args === 'string') return args;
  try {
    const str = JSON.stringify(args);
    return str.length > 120 ? str.slice(0, 120) + '...' : str;
  } catch {
    return String(args);
  }
}

// ---- Filter Tabs ----

function FilterTabs() {
  const { filterStatus, setFilterStatus, approvals } = useApprovalStore();

  const pending = approvals.filter((a) => a.status === 'pending').length;
  const approved = approvals.filter((a) => a.status === 'approved').length;
  const denied = approvals.filter((a) => a.status === 'denied').length;
  const expired = approvals.filter((a) => a.status === 'expired').length;

  const tabs: { value: ApprovalFilterStatus; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: approvals.length },
    { value: 'pending', label: 'Pending', count: pending },
    { value: 'approved', label: 'Approved', count: approved },
    { value: 'denied', label: 'Denied', count: denied },
    { value: 'expired', label: 'Expired', count: expired },
  ];

  return (
    <div
      className="flex items-center gap-1 px-3 py-2"
      style={{ borderBottom: '1px solid var(--glass-border)' }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => setFilterStatus(tab.value)}
          className="flex items-center gap-1.5"
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            padding: '3px 8px',
            borderRadius: 4,
            border:
              filterStatus === tab.value
                ? '1px solid rgba(0,212,255,0.3)'
                : '1px solid transparent',
            background: filterStatus === tab.value ? 'rgba(0,212,255,0.08)' : 'transparent',
            color: filterStatus === tab.value ? 'var(--cyan)' : 'var(--text-tertiary)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {tab.label}
          {tab.count > 0 && (
            <span
              style={{
                fontSize: 9,
                background:
                  tab.value === 'pending' && tab.count > 0
                    ? 'rgba(255,184,0,0.15)'
                    : 'rgba(255,255,255,0.06)',
                color:
                  tab.value === 'pending' && tab.count > 0
                    ? 'var(--amber)'
                    : 'var(--text-tertiary)',
                padding: '0 4px',
                borderRadius: 3,
              }}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ---- Approval Card ----

function ApprovalCard({
  approval,
  isSelected,
}: {
  approval: ApprovalRequest;
  isSelected: boolean;
}) {
  const { selectApproval, approve, deny } = useApprovalStore();
  const shellSelectApproval = useShellStore((s) => s.selectApproval);
  const isPending = approval.status === 'pending';

  const handleClick = () => {
    selectApproval(approval.id);
    shellSelectApproval(approval.id);
  };

  const risk = (approval.risk as ApprovalRisk) ?? 'low';

  return (
    <button
      className="w-full text-left px-3 py-3 transition-all duration-150"
      style={{
        background: isSelected ? 'rgba(0,212,255,0.06)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--cyan)' : '2px solid transparent',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
        // Amber border for pending
        ...(isPending && !isSelected ? { borderLeft: '2px solid var(--amber)' } : {}),
      }}
      onClick={handleClick}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'transparent';
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-1.5">
        <Wrench size={14} style={{ color: 'var(--text-tertiary)' }} />
        <span
          className="flex-1 truncate"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 500,
            color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          {approval.toolName}
        </span>

        {/* Risk badge */}
        <span
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 9,
            fontWeight: 600,
            color: riskColors[risk],
            background: `${riskColors[risk]}15`,
            padding: '1px 5px',
            borderRadius: 3,
            letterSpacing: 0.5,
          }}
        >
          {riskLabels[risk]}
        </span>

        {/* Status indicator */}
        {isPending ? (
          <Clock size={12} style={{ color: 'var(--amber)' }} />
        ) : approval.status === 'approved' ? (
          <CheckCircle2 size={12} style={{ color: 'var(--emerald)' }} />
        ) : approval.status === 'denied' ? (
          <XCircle size={12} style={{ color: 'var(--red)' }} />
        ) : (
          <AlertTriangle size={12} style={{ color: 'var(--text-tertiary)' }} />
        )}
      </div>

      {/* Preview / args */}
      {approval.preview && (
        <div
          className="truncate mb-1"
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
          }}
        >
          {approval.preview}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3">
        <span
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
          }}
        >
          {formatTimeAgo(approval.createdAt)}
        </span>
        {approval.source && (
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
            }}
          >
            {approval.source}
          </span>
        )}
      </div>

      {/* Quick action buttons for pending */}
      {isPending && (
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              approve(approval.id);
            }}
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              padding: '3px 10px',
              borderRadius: 4,
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
            onClick={(e) => {
              e.stopPropagation();
              deny(approval.id);
            }}
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              padding: '3px 10px',
              borderRadius: 4,
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
      )}
    </button>
  );
}

// ---- Approval Detail ----

function ApprovalDetail({ approval }: { approval: ApprovalRequest }) {
  const { approve, deny, remember } = useApprovalStore();
  const isPending = approval.status === 'pending';
  const risk = (approval.risk as ApprovalRisk) ?? 'low';

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Header */}
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

        {/* Status */}
        <div className="flex items-center gap-2">
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color:
                approval.status === 'pending'
                  ? 'var(--amber)'
                  : approval.status === 'approved'
                    ? 'var(--emerald)'
                    : approval.status === 'denied'
                      ? 'var(--red)'
                      : 'var(--text-tertiary)',
              textTransform: 'uppercase',
              fontWeight: 600,
              letterSpacing: 0.5,
            }}
          >
            {approval.status}
          </span>
        </div>
      </div>

      {/* Metadata */}
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

      {/* Args */}
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

      {/* Actions for pending */}
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

// ---- Empty State ----

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3">
        <ShieldCheck size={48} className="mx-auto" style={{ color: 'var(--text-tertiary)' }} />
        <div
          style={{
            fontFamily: 'var(--font-hud)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            letterSpacing: 1,
          }}
        >
          NO APPROVALS
        </div>
        <div
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            maxWidth: 280,
          }}
        >
          Tool calls requiring your permission will appear here.
        </div>
      </div>
    </div>
  );
}

// ---- Main View ----

export function ApprovalsView() {
  const { approvals, selectedId, filterStatus, isLoading, error, fetchApprovals, selectApproval } =
    useApprovalStore();

  const shellSelectedId = useShellStore((s) => s.selectedApprovalId);

  useEffect(() => {
    fetchApprovals();
    // Poll for new approvals every 10s
    const interval = setInterval(fetchApprovals, 10_000);
    return () => clearInterval(interval);
  }, [fetchApprovals]);

  // Sync from shellStore
  useEffect(() => {
    if (shellSelectedId && shellSelectedId !== selectedId) {
      selectApproval(shellSelectedId);
    }
  }, [shellSelectedId, selectedId, selectApproval]);

  // Apply filter
  const filtered = approvals.filter((a) => {
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    return true;
  });

  const selectedApproval = approvals.find((a) => a.id === selectedId) ?? null;

  // Loading
  if (isLoading && approvals.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--cyan)' }} />
      </div>
    );
  }

  // Error
  if (error && approvals.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <XCircle size={32} className="mx-auto" style={{ color: 'var(--red)' }} />
          <div
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: 'var(--text-tertiary)',
              maxWidth: 280,
            }}
          >
            {error}
          </div>
          <button
            onClick={fetchApprovals}
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: 'var(--cyan)',
              background: 'rgba(0,212,255,0.08)',
              border: '1px solid rgba(0,212,255,0.2)',
              borderRadius: 6,
              padding: '4px 12px',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty
  if (approvals.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left: Filter + List */}
      <div
        className="flex flex-col overflow-hidden"
        style={{
          width: 340,
          borderRight: '1px solid var(--glass-border)',
          background: 'rgba(4,6,14,0.4)',
          flexShrink: 0,
        }}
      >
        <FilterTabs />
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <span
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 11,
                  color: 'var(--text-tertiary)',
                }}
              >
                No approvals match filter
              </span>
            </div>
          ) : (
            filtered.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                isSelected={approval.id === selectedId}
              />
            ))
          )}
        </div>
      </div>

      {/* Right: Detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedApproval ? (
          <ApprovalDetail approval={selectedApproval} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-2">
              <ShieldCheck
                size={32}
                className="mx-auto"
                style={{ color: 'var(--text-tertiary)' }}
              />
              <div
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 11,
                  color: 'var(--text-tertiary)',
                }}
              >
                Select an approval to view details
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
