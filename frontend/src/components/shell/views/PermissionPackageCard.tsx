import { usePermissionGrantStore } from '@/stores/permissionGrantStore';
import type { PermissionPackage, RiskLevel, DecisionSource } from '@/stores/permissionGrantStore';

interface PermissionPackageCardProps {
  pkg: PermissionPackage;
  onApprove?: () => void;
  onReject?: () => void;
  compact?: boolean;
}

/** Risk badge component */
function RiskBadge({ risk }: { risk: RiskLevel }) {
  const getRiskColor = usePermissionGrantStore((s) => s.getRiskColor);
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 600,
        color: 'white',
        backgroundColor: getRiskColor(risk),
      }}
    >
      {risk.toUpperCase()}
    </span>
  );
}

/** Decision source badge */
function SourceBadge({ source }: { source: DecisionSource }) {
  const getSourceLabel = usePermissionGrantStore((s) => s.getSourceLabel);
  const colors: Record<DecisionSource, string> = {
    system_auto: '#6b7280',
    user_memory: '#8b5cf6',
    explicit_user: '#3b82f6',
    plan_grant: '#10b981',
  };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 500,
        color: 'white',
        backgroundColor: colors[source] ?? '#6b7280',
      }}
    >
      {getSourceLabel(source)}
    </span>
  );
}

/** Permission package card — shows required permissions before execution */
export function PermissionPackageCard({
  pkg,
  onApprove,
  onReject,
  compact = false,
}: PermissionPackageCardProps) {
  const highRiskActions = pkg.externalActions.filter(
    (a) => a.risk === 'high' || a.risk === 'critical'
  );
  const mediumRiskActions = pkg.externalActions.filter((a) => a.risk === 'medium');
  const lowRiskActions = pkg.externalActions.filter((a) => a.risk === 'low');

  if (compact) {
    return (
      <div style={{ padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>Permission Package</span>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>
            {pkg.externalActions.length} action(s) required
          </span>
        </div>
        {highRiskActions.length > 0 && (
          <div
            style={{
              marginTop: '8px',
              padding: '8px',
              backgroundColor: '#fef2f2',
              borderRadius: '6px',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#dc2626' }}>
              High-Risk External Writes
            </div>
            {highRiskActions.map((action, i) => (
              <div key={i} style={{ fontSize: '12px', marginTop: '4px' }}>
                <RiskBadge risk={action.risk} /> {action.description}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>
        Permission Package
      </h3>
      <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
        The following permissions are required for this execution:
      </p>

      {/* High-risk external writes — shown separately */}
      {highRiskActions.length > 0 && (
        <div
          style={{
            marginBottom: '12px',
            padding: '12px',
            backgroundColor: '#fef2f2',
            borderRadius: '6px',
            border: '1px solid #fecaca',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#dc2626', marginBottom: '8px' }}>
            High-Risk External Writes (require explicit approval)
          </div>
          {highRiskActions.map((action, i) => (
            <div
              key={i}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}
            >
              <RiskBadge risk={action.risk} />
              <span style={{ fontSize: '13px' }}>{action.description}</span>
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>{action.resource}</span>
            </div>
          ))}
        </div>
      )}

      {/* Medium-risk actions */}
      {mediumRiskActions.length > 0 && (
        <div
          style={{
            marginBottom: '12px',
            padding: '12px',
            backgroundColor: '#fffbeb',
            borderRadius: '6px',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#d97706', marginBottom: '8px' }}>
            Medium-Risk Actions
          </div>
          {mediumRiskActions.map((action, i) => (
            <div
              key={i}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}
            >
              <RiskBadge risk={action.risk} />
              <span style={{ fontSize: '13px' }}>{action.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Low-risk actions (auto-allowed) */}
      {lowRiskActions.length > 0 && (
        <div
          style={{
            marginBottom: '12px',
            padding: '12px',
            backgroundColor: '#f0fdf4',
            borderRadius: '6px',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#16a34a', marginBottom: '8px' }}>
            Low-Risk Actions (auto-allowed)
          </div>
          {lowRiskActions.map((action, i) => (
            <div
              key={i}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}
            >
              <RiskBadge risk={action.risk} />
              <span style={{ fontSize: '13px' }}>{action.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Decision sources */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
          Decision Sources:
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(['system_auto', 'user_memory', 'explicit_user', 'plan_grant'] as DecisionSource[]).map(
            (source) => (
              <SourceBadge key={source} source={source} />
            )
          )}
        </div>
      </div>

      {/* Action buttons */}
      {pkg.status === 'pending' && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button
            onClick={onApprove}
            style={{
              padding: '8px 16px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Approve Package
          </button>
          <button
            onClick={onReject}
            style={{
              padding: '8px 16px',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

/** Permission grants list for a scope */
export function PermissionGrantsList({
  scopeLevel,
  scopeId,
}: {
  scopeLevel: 'run' | 'task' | 'workspace' | 'project';
  scopeId: string;
}) {
  const grants = usePermissionGrantStore((s) => s.getGrantsForScope(scopeLevel, scopeId));
  const revokeGrant = usePermissionGrantStore((s) => s.revokeGrant);
  const getSourceLabel = usePermissionGrantStore((s) => s.getSourceLabel);
  const getRiskColor = usePermissionGrantStore((s) => s.getRiskColor);

  if (grants.length === 0) {
    return (
      <div style={{ padding: '12px', color: '#9ca3af', fontSize: '13px' }}>
        No active permission grants for this scope.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {grants.map((grant) => (
        <div
          key={grant.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
          }}
        >
          <div>
            <span style={{ fontWeight: 600, fontSize: '13px' }}>{grant.action}</span>
            <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: '8px' }}>
              {grant.resourcePattern}
            </span>
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: getRiskColor(grant.riskLevel),
                marginLeft: '8px',
              }}
            />
            <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '4px' }}>
              {getSourceLabel(grant.source)}
            </span>
          </div>
          <button
            onClick={() => revokeGrant(grant.id)}
            style={{
              padding: '4px 8px',
              backgroundColor: 'transparent',
              color: '#ef4444',
              border: '1px solid #ef4444',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Revoke
          </button>
        </div>
      ))}
    </div>
  );
}
