import { create } from 'zustand';
import { jarvisClient } from '@/lib/jarvisClient';
import {
  approvalListResponseSchema,
  type ApprovalRequest,
  type ApprovalStatus,
} from '@/lib/apiSchemas';

export type { ApprovalRequest, ApprovalStatus };
export type ApprovalRisk = 'low' | 'medium' | 'high' | 'critical';
export type ApprovalFilterStatus = 'all' | ApprovalStatus;

interface ApprovalState {
  approvals: ApprovalRequest[];
  selectedId: string | null;
  filterStatus: ApprovalFilterStatus;
  isLoading: boolean;
  error: string | null;

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
      const raw = await jarvisClient.get('/api/approvals');
      const parsed = approvalListResponseSchema.parse(raw);
      set({ approvals: parsed.data, isLoading: false });
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
