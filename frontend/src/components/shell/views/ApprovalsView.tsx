import { useEffect } from 'react';
import { ShieldCheck, XCircle, Loader2 } from 'lucide-react';
import { useApprovalStore } from '@/stores/approvalStore';
import { useShellStore } from '@/stores/shellStore';
import { groupPendingApprovals } from './approvalHelpers';
import { FilterTabs, ApprovalCard, BatchApprovalCard } from './ApprovalListPanel';
import { ApprovalDetail, BatchApprovalDetail } from './ApprovalDetailPanel';

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

export function ApprovalsView() {
  const { approvals, selectedId, filterStatus, isLoading, error, fetchApprovals, selectApproval } =
    useApprovalStore();

  const shellSelectedId = useShellStore((s) => s.selectedApprovalId);

  useEffect(() => {
    fetchApprovals();
    const interval = setInterval(fetchApprovals, 10_000);
    return () => clearInterval(interval);
  }, [fetchApprovals]);

  useEffect(() => {
    if (shellSelectedId && shellSelectedId !== selectedId) {
      selectApproval(shellSelectedId);
    }
  }, [shellSelectedId, selectedId, selectApproval]);

  const filtered = approvals.filter((a) => {
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    return true;
  });

  const displayItems = groupPendingApprovals(filtered);

  const isBatchSelected = selectedId?.startsWith('batch-');
  const selectedBatchRunId = isBatchSelected ? selectedId?.replace('batch-', '') : null;
  const selectedBatch = isBatchSelected
    ? (displayItems.find((item) => item.type === 'batch' && item.runId === selectedBatchRunId) ??
      null)
    : null;
  const selectedApproval = !isBatchSelected
    ? (approvals.find((a) => a.id === selectedId) ?? null)
    : null;

  if (isLoading && approvals.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--cyan)' }} />
      </div>
    );
  }

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

  if (approvals.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex-1 flex overflow-hidden">
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
