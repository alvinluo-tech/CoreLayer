import { create } from 'zustand';
import { jarvisClient } from '@/lib/jarvisClient';

// ---- Types (mirrors daemon ApprovalRequestRow) ----

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';
export type ApprovalRisk = 'low' | 'medium' | 'high' | 'critical';

export interface ApprovalRequest {
  id: string;
  runId: string;
  toolId: string;
  toolName: string;
  args: unknown;
  risk: string;
  status: ApprovalStatus;
  projectScope: boolean;
  decidedAt: number | null;
  createdAt: number;
  mode: string | null;
  source: string | null;
  preview: string | null;
  toolCallId: string | null;
  expiresAt: number | null;
}

export type ApprovalFilterStatus = 'all' | ApprovalStatus;

interface ApprovalState {
  approvals: ApprovalRequest[];
  selectedId: string | null;
  filterStatus: ApprovalFilterStatus;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchApprovals: () => Promise<void>;
  selectApproval: (id: string | null) => void;
  approve: (id: string) => Promise<void>;
  deny: (id: string) => Promise<void>;
  remember: (
    id: string,
    decision: 'auto' | 'confirm' | 'deny',
    scope?: 'global' | 'project',
    projectId?: string
  ) => Promise<void>;
  setFilterStatus: (status: ApprovalFilterStatus) => void;

  // Derived
  pendingCount: () => number;
}

export const useApprovalStore = create<ApprovalState>((set, get) => ({
  approvals: [],
  selectedId: null,
  filterStatus: 'all',
  isLoading: false,
  error: null,

  fetchApprovals: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await jarvisClient.get<ApprovalRequest[]>('/api/approvals');
      set({ approvals: data, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load approvals';
      set({ error: message, isLoading: false });
    }
  },

  selectApproval: (id) => {
    set({ selectedId: id });
  },

  approve: async (id) => {
    try {
      await jarvisClient.post(`/api/approvals/${id}/approve`);
      // Refresh list
      await get().fetchApprovals();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to approve';
      set({ error: message });
    }
  },

  deny: async (id) => {
    try {
      await jarvisClient.post(`/api/approvals/${id}/deny`);
      await get().fetchApprovals();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to deny';
      set({ error: message });
    }
  },

  remember: async (id, decision, scope, projectId) => {
    try {
      await jarvisClient.post(`/api/approvals/${id}/remember`, { decision, scope, projectId });
      await get().fetchApprovals();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save preference';
      set({ error: message });
    }
  },

  setFilterStatus: (status) => {
    set({ filterStatus: status });
  },

  pendingCount: () => {
    return get().approvals.filter((a) => a.status === 'pending').length;
  },
}));
