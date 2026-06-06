import { create } from 'zustand';
import { jarvisClient } from '@/lib/jarvisClient';

// ---- Types (mirrors daemon MemoryRow) ----

export type MemoryScopeType = 'user' | 'workspace' | 'project' | 'agent' | 'task' | 'conversation';
export type MemoryType = 'fact' | 'preference' | 'context' | 'summary';
export type MemoryTier = 'preference' | 'context' | 'fact';

export interface Memory {
  id: string;
  userId: string;
  scopeType: MemoryScopeType;
  scopeId: string | null;
  type: MemoryType;
  tier: MemoryTier;
  key: string;
  value: string;
  source: string | null;
  confidence: number | null;
  uses: number;
  lastInjectedAt: string | null;
  sourceRunId: string | null;
  sourceMessageId: string | null;
  lastVerifiedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MemoryFilterScope = 'all' | MemoryScopeType;
export type MemoryFilterType = 'all' | MemoryType;

interface MemoryFilters {
  scope: MemoryFilterScope;
  type: MemoryFilterType;
}

interface MemoryState {
  memories: Memory[];
  selectedId: string | null;
  filters: MemoryFilters;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchMemories: () => Promise<void>;
  selectMemory: (id: string | null) => void;
  updateMemory: (
    id: string,
    data: { key?: string; value?: string; type?: string }
  ) => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;
  setScopeFilter: (scope: MemoryFilterScope) => void;
  setTypeFilter: (type: MemoryFilterType) => void;
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  memories: [],
  selectedId: null,
  filters: { scope: 'all', type: 'all' },
  isLoading: false,
  error: null,

  fetchMemories: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await jarvisClient.get<Memory[]>('/api/memories');
      set({ memories: data, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load memories';
      set({ error: message, isLoading: false });
    }
  },

  selectMemory: (id) => {
    set({ selectedId: id });
  },

  updateMemory: async (id, data) => {
    try {
      await jarvisClient.patch(`/api/memories/${id}`, data);
      await get().fetchMemories();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update memory';
      set({ error: message });
    }
  },

  deleteMemory: async (id) => {
    try {
      await jarvisClient.del(`/api/memories/${id}`);
      // Clear selection if deleted
      if (get().selectedId === id) {
        set({ selectedId: null });
      }
      await get().fetchMemories();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete memory';
      set({ error: message });
    }
  },

  setScopeFilter: (scope) => {
    set({ filters: { ...get().filters, scope } });
  },

  setTypeFilter: (type) => {
    set({ filters: { ...get().filters, type } });
  },
}));
