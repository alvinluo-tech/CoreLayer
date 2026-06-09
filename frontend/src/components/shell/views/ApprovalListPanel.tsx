import { CheckCircle2, XCircle, AlertTriangle, Clock, Wrench, Loader2 } from 'lucide-react';
import {
  useApprovalStore,
  type ApprovalRequest,
  type ApprovalRisk,
  type ApprovalFilterStatus,
} from '@/stores/approvalStore';
import { useShellStore } from '@/stores/shellStore';
import { riskColors, riskLabels, formatTimeAgo } from './approvalHelpers';

export function FilterTabs() {
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

export function ApprovalCard({
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

export function BatchApprovalCard({
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
