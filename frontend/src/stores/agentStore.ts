import { create } from 'zustand';
import { jarvisClient } from '@/lib/jarvisClient';
import { agentProfileListResponseSchema, type AgentProfile } from '@/lib/apiSchemas';

export type { AgentProfile };

interface AgentState {
  agents: AgentProfile[];
  selectedId: string | null;
  isLoading: boolean;
  error: string | null;

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
      const raw = await jarvisClient.get('/api/agent-profiles');
      const parsed = agentProfileListResponseSchema.parse(raw);
      set({ agents: parsed.data, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load agents';
      set({ error: message, isLoading: false });
    }
  },

  selectAgent: (id) => {
    set({ selectedId: id });
  },
}));
