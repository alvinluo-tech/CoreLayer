import { create } from 'zustand';

/** Permission grant scope */
export type GrantScope = 'run' | 'task' | 'workspace' | 'project';

/** Permission action types */
export type PermissionAction =
  | 'file.read'
  | 'file.write'
  | 'shell.exec'
  | 'network.request'
  | 'secret.read'
  | 'external.write';

/** Risk level */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** Decision source */
export type DecisionSource = 'system_auto' | 'user_memory' | 'explicit_user' | 'plan_grant';

/** Permission grant */
export interface PermissionGrant {
  id: string;
  subject: { agentId: string; executorId?: string };
  action: PermissionAction;
  resourcePattern: string;
  scope: { level: GrantScope; id: string };
  constraints: {
    expiresAt?: string;
    maxUses?: number;
    requireDiffPreview?: boolean;
  };
  source: DecisionSource;
  riskLevel: RiskLevel;
  useCount: number;
  createdAt: string;
}

/** Permission package shown before execution */
export interface PermissionPackage {
  runId: string;
  grants: PermissionGrant[];
  externalActions: Array<{
    action: PermissionAction;
    resource: string;
    risk: RiskLevel;
    description: string;
  }>;
  status: 'pending' | 'approved' | 'rejected';
}

interface PermissionGrantState {
  /** Active permission grants */
  grants: PermissionGrant[];
  /** Current permission package awaiting approval */
  pendingPackage: PermissionPackage | null;
  /** History of approved/rejected packages */
  packageHistory: PermissionPackage[];
  /** Whether a package needs user attention */
  needsAttention: boolean;

  /** Set the pending permission package */
  setPendingPackage: (pkg: PermissionPackage | null) => void;
  /** Approve the pending package */
  approvePackage: () => void;
  /** Reject the pending package */
  rejectPackage: () => void;
  /** Revoke a specific grant */
  revokeGrant: (grantId: string) => void;
  /** Revoke all grants for a scope */
  revokeGrantsForScope: (level: GrantScope, id: string) => void;
  /** Get grants for a scope */
  getGrantsForScope: (level: GrantScope, id: string) => PermissionGrant[];
  /** Get decision source display label */
  getSourceLabel: (source: DecisionSource) => string;
  /** Get risk level display color */
  getRiskColor: (risk: RiskLevel) => string;
}

export const usePermissionGrantStore = create<PermissionGrantState>((set, get) => ({
  grants: [],
  pendingPackage: null,
  packageHistory: [],
  needsAttention: false,

  setPendingPackage: (pkg) => {
    set({
      pendingPackage: pkg,
      needsAttention: pkg !== null && pkg.status === 'pending',
    });
  },

  approvePackage: () => {
    const pkg = get().pendingPackage;
    if (!pkg) return;

    const approved: PermissionPackage = { ...pkg, status: 'approved' };
    set((state) => ({
      pendingPackage: null,
      needsAttention: false,
      packageHistory: [...state.packageHistory, approved],
      grants: [...state.grants, ...pkg.grants],
    }));
  },

  rejectPackage: () => {
    const pkg = get().pendingPackage;
    if (!pkg) return;

    const rejected: PermissionPackage = { ...pkg, status: 'rejected' };
    set((state) => ({
      pendingPackage: null,
      needsAttention: false,
      packageHistory: [...state.packageHistory, rejected],
    }));
  },

  revokeGrant: (grantId) => {
    set((state) => ({
      grants: state.grants.filter((g) => g.id !== grantId),
    }));
  },

  revokeGrantsForScope: (level, id) => {
    set((state) => ({
      grants: state.grants.filter((g) => !(g.scope.level === level && g.scope.id === id)),
    }));
  },

  getGrantsForScope: (level, id) => {
    const now = new Date();
    return get().grants.filter((g) => {
      if (g.scope.level !== level || g.scope.id !== id) return false;
      if (g.constraints.expiresAt && new Date(g.constraints.expiresAt) < now) return false;
      if (g.constraints.maxUses !== undefined && g.useCount >= g.constraints.maxUses) return false;
      return true;
    });
  },

  getSourceLabel: (source) => {
    const labels: Record<DecisionSource, string> = {
      system_auto: 'System Auto-Allow',
      user_memory: 'Remembered Preference',
      explicit_user: 'Explicit Approval',
      plan_grant: 'Plan-Scoped Grant',
    };
    return labels[source] ?? source;
  },

  getRiskColor: (risk) => {
    const colors: Record<RiskLevel, string> = {
      low: '#4ade80',
      medium: '#fbbf24',
      high: '#f97316',
      critical: '#ef4444',
    };
    return colors[risk] ?? '#9ca3af';
  },
}));
