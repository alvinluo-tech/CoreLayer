import { create } from 'zustand';
import { jarvisClient } from '@/lib/jarvisClient';
import { agentProfileListResponseSchema, type AgentProfile } from '@/lib/apiSchemas';

export type { AgentProfile };

interface CreateAgentInput {
  name: string;
  description?: string;
  modelPolicy?: unknown;
  executorPolicy?: unknown;
  skills?: string[];
  tools?: string[];
  knowledgeScopes?: string[];
  permissions?: string[];
  memoryScopes?: string[];
  isDefault?: boolean;
}

interface UpdateAgentInput {
  name?: string;
  description?: string | null;
  modelPolicy?: unknown;
  executorPolicy?: unknown;
  skills?: string[];
  tools?: string[];
  knowledgeScopes?: string[];
  permissions?: string[];
  memoryScopes?: string[];
  isDefault?: boolean;
}

interface AgentState {
  agents: AgentProfile[];
  selectedId: string | null;
  isLoading: boolean;
  error: string | null;

  fetchAgents: () => Promise<void>;
  selectAgent: (id: string | null) => void;
  createAgent: (input: CreateAgentInput) => Promise<AgentProfile>;
  updateAgent: (id: string, data: UpdateAgentInput) => Promise<AgentProfile>;
  deleteAgent: (id: string) => Promise<void>;
  setDefaultAgent: (id: string) => Promise<AgentProfile>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
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

  createAgent: async (input) => {
    const raw = await jarvisClient.post<{ data: AgentProfile }>('/api/agent-profiles', input);
    const profile = raw.data;
    set((state) => ({ agents: [...state.agents, profile] }));
    return profile;
  },

  updateAgent: async (id, data) => {
    const raw = await jarvisClient.patch<{ data: AgentProfile }>(`/api/agent-profiles/${id}`, data);
    const profile = raw.data;
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? profile : a)),
    }));
    return profile;
  },

  deleteAgent: async (id) => {
    const { agents } = get();
    if (agents.length <= 1) {
      throw new Error('Cannot delete the last agent profile');
    }
    await jarvisClient.del(`/api/agent-profiles/${id}`);
    set((state) => ({
      agents: state.agents.filter((a) => a.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    }));
  },

  setDefaultAgent: async (id) => {
    await jarvisClient.post(`/api/agent-profiles/${id}/set-default`);
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === id ? { ...a, isDefault: true } : { ...a, isDefault: false }
      ),
    }));
    return get().agents.find((a) => a.id === id)!;
  },
}));
