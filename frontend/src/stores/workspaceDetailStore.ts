import { create } from 'zustand';
import { jarvisClient } from '@/lib/jarvisClient';
import { workspaceDetailSchema, type WorkspaceDetail } from '@/lib/apiSchemas';

interface WorkspaceDetailState {
  detail: WorkspaceDetail | null;
  isLoading: boolean;
  error: string | null;

  fetchDetail: (workspaceId: string) => Promise<void>;
  clearDetail: () => void;
}

export const useWorkspaceDetailStore = create<WorkspaceDetailState>((set) => ({
  detail: null,
  isLoading: false,
  error: null,

  fetchDetail: async (workspaceId: string) => {
    set({ isLoading: true, error: null });
    try {
      const raw = await jarvisClient.get<{ data: WorkspaceDetail }>(
        `/api/workspaces/${workspaceId}/detail`
      );
      const parsed = workspaceDetailSchema.parse(raw.data);
      set({ detail: parsed, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load workspace';
      set({ error: message, isLoading: false });
    }
  },

  clearDetail: () => set({ detail: null, error: null }),
}));
