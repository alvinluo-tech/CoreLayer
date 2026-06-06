import { create } from 'zustand';
import { jarvisClient } from '@/lib/jarvisClient';

// ---- Types (mirrors daemon AgentRunRow / AgentRunEventRow) ----

export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';
export type RunMode = 'chat' | 'voice' | 'tick' | 'scheduled' | 'workflow' | 'regenerate';

export interface AgentRun {
  id: string;
  conversationId: string | null;
  workspaceId: string | null;
  projectId: string | null;
  taskId: string | null;
  agentId: string | null;
  userMessageId: string | null;
  assistantMessageId: string | null;
  status: RunStatus;
  mode: RunMode;
  selectedModel: string | null;
  routeReason: string | null;
  selectedTools: string[] | null;
  memoryReads: string[] | null;
  memoryWrites: string[] | null;
  toolCalls: unknown[] | null;
  toolCallCount: number | null;
  artifacts: unknown[] | null;
  approvals: unknown[] | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
}

export interface AgentRunEvent {
  id: string;
  runId: string;
  sequence: number;
  type: string;
  payload: unknown;
  createdAt: string;
}

// ---- Filters ----

export type RunFilterStatus = 'all' | RunStatus;
export type RunFilterMode = 'all' | RunMode;

interface RunFilters {
  status: RunFilterStatus;
  mode: RunFilterMode;
}

// ---- State ----

interface RunState {
  runs: AgentRun[];
  selectedRunId: string | null;
  events: AgentRunEvent[];
  filters: RunFilters;
  isLoading: boolean;
  isLoadingEvents: boolean;
  error: string | null;

  // Actions
  fetchRuns: () => Promise<void>;
  selectRun: (runId: string) => Promise<void>;
  clearSelection: () => void;
  setStatusFilter: (status: RunFilterStatus) => void;
  setModeFilter: (mode: RunFilterMode) => void;
}

export const useRunStore = create<RunState>((set, get) => ({
  runs: [],
  selectedRunId: null,
  events: [],
  filters: { status: 'all', mode: 'all' },
  isLoading: false,
  isLoadingEvents: false,
  error: null,

  fetchRuns: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await jarvisClient.get<AgentRun[]>('/api/runs');
      set({ runs: data, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load runs';
      set({ error: message, isLoading: false });
    }
  },

  selectRun: async (runId: string) => {
    set({ selectedRunId: runId, events: [], isLoadingEvents: true });
    try {
      const events = await jarvisClient.get<AgentRunEvent[]>(`/api/runs/${runId}/events`);
      set({ events, isLoadingEvents: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load run events';
      set({ error: message, isLoadingEvents: false });
    }
  },

  clearSelection: () => {
    set({ selectedRunId: null, events: [] });
  },

  setStatusFilter: (status) => {
    set({ filters: { ...get().filters, status } });
  },

  setModeFilter: (mode) => {
    set({ filters: { ...get().filters, mode } });
  },
}));
