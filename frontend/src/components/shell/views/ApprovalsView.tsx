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

// ---- Batch Grouping ----

type ListItem =
  | { type: 'single'; data: ApprovalRequest }
  | { type: 'batch'; runId: string; approvals: ApprovalRequest[] };

function groupPendingApprovals(list: ApprovalRequest[]): ListItem[] {
  const pendingGroups: Record<string, ApprovalRequest[]> = {};
  const processedList: ListItem[] = [];

  for (const item of list) {
    if (item.status === 'pending' && item.runId) {
      const group = pendingGroups[item.runId] ?? [];
      group.push(item);
      pendingGroups[item.runId] = group;
    } else {
      processedList.push({ type: 'single', data: item });
    }
  }

  for (const [runId, group] of Object.entries(pendingGroups)) {
    if (group.length > 1) {
      processedList.push({ type: 'batch', runId, approvals: group });
    } else if (group.length === 1 && group[0]) {
      processedList.push({ type: 'single', data: group[0] });
    }
  }

  return processedList;
}

// ---- Filter Tabs ----

function FilterTabs() {
  const { filterStatus, setFilterStatus, approvals } = useApprovalStore();

  const pending = approvals.filter((a) => a.status === 'pending').length;
  const executing = approvals.filter((a) => a.status === 'executing').length;
  const approved = approvals.filter((a) => a.status === 'approved').length;
  const denied = approvals.filter((a) => a.status === 'denied').length;
  const failed = approvals.filter((a) => a.status === 'failed').length;
  const expired = approvals.filter((a) => a.status === 'expired').length;

  const tabs: { value: ApprovalFilterStatus; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: approvals.length },
    { value: 'pending', label: 'Pending', count: pending },
    { value: 'executing', label: 'Executing', count: executing },
    { value: 'approved', label: 'Approved', count: approved },
    { value: 'denied', label: 'Denied', count: denied },
    { value: 'failed', label: 'Failed', count: failed },
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
                    : tab.value === 'executing' && tab.count > 0
                      ? 'rgba(0,212,255,0.15)'
                      : tab.value === 'failed' && tab.count > 0
                        ? 'rgba(239,68,68,0.15)'
                        : 'rgba(255,255,255,0.06)',
                color:
                  tab.value === 'pending' && tab.count > 0
                    ? 'var(--amber)'
                    : tab.value === 'executing' && tab.count > 0
                      ? 'var(--cyan)'
                      : tab.value === 'failed' && tab.count > 0
                        ? 'var(--red)'
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
        ) : approval.status === 'executing' ? (
          <Loader2 size={12} className="animate-spin" style={{ color: 'var(--cyan)' }} />
        ) : approval.status === 'approved' ? (
          <CheckCircle2 size={12} style={{ color: 'var(--emerald)' }} />
        ) : approval.status === 'denied' ? (
          <XCircle size={12} style={{ color: 'var(--red)' }} />
        ) : approval.status === 'failed' ? (
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

// ---- Batch Approval Card ----

function BatchApprovalCard({
  item,
  isSelected,
}: {
  item: { type: 'batch'; runId: string; approvals: ApprovalRequest[] };
  isSelected: boolean;
}) {
  const { selectApproval } = useApprovalStore();
  const shellSelectApproval = useShellStore((s) => s.selectApproval);
  const batchId = `batch-${item.runId}`;

  const highestRisk = item.approvals.reduce((max, a) => {
    const r = (a.risk as ApprovalRisk) ?? 'low';
    const order = { low: 0, medium: 1, high: 2, critical: 3 };
    return order[r] > order[max] ? r : max;
  }, 'low' as ApprovalRisk);

  const handleClick = () => {
    selectApproval(batchId);
    shellSelectApproval(batchId);
  };

  return (
    <button
      className="w-full text-left px-3 py-3 transition-all duration-150"
      style={{
        background: isSelected ? 'rgba(255,184,0,0.06)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--amber)' : '2px solid var(--amber)',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
      }}
      onClick={handleClick}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'rgba(255,184,0,0.04)';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'transparent';
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-1.5">
        <AlertTriangle size={14} style={{ color: 'var(--amber)' }} />
        <span
          className="flex-1 truncate"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--amber)',
          }}
        >
          Batch ({item.approvals.length} items)
        </span>
        <span
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 9,
            fontWeight: 600,
            color: riskColors[highestRisk],
            background: `${riskColors[highestRisk]}15`,
            padding: '1px 5px',
            borderRadius: 3,
            letterSpacing: 0.5,
          }}
        >
          {riskLabels[highestRisk]}
        </span>
        <Clock size={12} style={{ color: 'var(--amber)' }} />
      </div>

      {/* Tool names preview */}
      <div
        className="truncate mb-1"
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 11,
          color: 'var(--text-tertiary)',
        }}
      >
        {item.approvals.map((a) => a.toolName).join(', ')}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3">
        <span
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
          }}
        >
          {item.approvals[0] ? formatTimeAgo(item.approvals[0].createdAt) : ''}
        </span>
      </div>
    </button>
  );
}

// ---- Batch Approval Detail ----

function BatchApprovalDetail({
  item,
}: {
  item: { type: 'batch'; runId: string; approvals: ApprovalRequest[] };
}) {
  const { approveBatch, denyBatch } = useApprovalStore();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Header */}
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

        {/* Tool list */}
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

      {/* Action buttons */}
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
                  : approval.status === 'executing'
                    ? 'var(--cyan)'
                    : approval.status === 'approved'
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

  // Group pending approvals by runId for batch display
  const displayItems = groupPendingApprovals(filtered);

  // Determine selected item (single or batch)
  const isBatchSelected = selectedId?.startsWith('batch-');
  const selectedBatchRunId = isBatchSelected ? selectedId?.replace('batch-', '') : null;
  const selectedBatch = isBatchSelected
    ? (displayItems.find((item) => item.type === 'batch' && item.runId === selectedBatchRunId) ??
      null)
    : null;
  const selectedApproval = !isBatchSelected
    ? (approvals.find((a) => a.id === selectedId) ?? null)
    : null;

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
          {displayItems.length === 0 ? (
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
            displayItems.map((item) => {
              if (item.type === 'single') {
                return (
                  <ApprovalCard
                    key={item.data.id}
                    approval={item.data}
                    isSelected={item.data.id === selectedId}
                  />
                );
              } else {
                return (
                  <BatchApprovalCard
                    key={`batch-${item.runId}`}
                    item={item}
                    isSelected={selectedId === `batch-${item.runId}`}
                  />
                );
              }
            })
          )}
        </div>
      </div>

      {/* Right: Detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {isBatchSelected && selectedBatch && selectedBatch.type === 'batch' ? (
          <BatchApprovalDetail item={selectedBatch} />
        ) : selectedApproval ? (
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
