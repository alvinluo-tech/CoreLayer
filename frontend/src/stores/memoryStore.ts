import { create } from 'zustand';
import { jarvisClient } from '@/lib/jarvisClient';
import {
  memoryListResponseSchema,
  type Memory,
  type MemoryScopeType,
  type MemoryType,
  type MemoryTier,
} from '@/lib/apiSchemas';

export type { Memory, MemoryScopeType, MemoryType, MemoryTier };

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
      const raw = await jarvisClient.get('/api/memories');
      const parsed = memoryListResponseSchema.parse(raw);
      set({ memories: parsed.data, isLoading: false });
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
