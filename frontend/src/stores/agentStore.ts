import { create } from 'zustand';
import { jarvisClient } from '@/lib/jarvisClient';

// ---- Types (mirrors daemon AgentProfileRow) ----

export interface AgentProfile {
  id: string;
  name: string;
  description: string | null;
  modelPolicy: unknown;
  skills: string[];
  tools: string[];
  knowledgeScopes: string[];
  permissions: string[];
  memoryScopes: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AgentState {
  agents: AgentProfile[];
  selectedId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchAgents: () => Promise<void>;
  selectAgent: (id: string | null) => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  selectedId: null,
  isLoading: false,
  error: null,

  fetchAgents: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await jarvisClient.get<AgentProfile[]>('/api/agent-profiles');
      set({ agents: data, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load agents';
      set({ error: message, isLoading: false });
    }
  },

  selectAgent: (id) => {
    set({ selectedId: id });
  },
}));
