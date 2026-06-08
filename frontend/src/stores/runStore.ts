import { create } from 'zustand';
import { jarvisClient } from '@/lib/jarvisClient';
import {
  runListResponseSchema,
  runEventsResponseSchema,
  runArtifactsResponseSchema,
  type AgentRun,
  type AgentRunEvent,
  type CodingArtifact,
  type RunStatus,
  type RunMode,
} from '@/lib/apiSchemas';

export type { AgentRun, AgentRunEvent, RunStatus, RunMode, CodingArtifact };

export type RunFilterStatus = 'all' | RunStatus;
export type RunFilterMode = 'all' | RunMode;

interface RunFilters {
  status: RunFilterStatus;
  mode: RunFilterMode;
}

interface RunState {
  runs: AgentRun[];
  selectedRunId: string | null;
  events: AgentRunEvent[];
  artifacts: CodingArtifact[];
  filters: RunFilters;
  isLoading: boolean;
  isLoadingEvents: boolean;
  isLoadingArtifacts: boolean;
  error: string | null;

  fetchRuns: () => Promise<void>;
  selectRun: (runId: string) => Promise<void>;
  clearSelection: () => void;
  setStatusFilter: (status: RunFilterStatus) => void;
  setModeFilter: (mode: RunFilterMode) => void;
  cancelRun: (runId: string) => Promise<void>;
  retryRun: (runId: string) => Promise<void>;
  fetchRunWithFilter: (status?: string) => Promise<void>;
}

export const useRunStore = create<RunState>((set, get) => ({
  runs: [],
  selectedRunId: null,
  events: [],
  artifacts: [],
  filters: { status: 'all', mode: 'all' },
  isLoading: false,
  isLoadingEvents: false,
  isLoadingArtifacts: false,
  error: null,

  fetchRuns: async () => {
    set({ isLoading: true, error: null });
    try {
      const raw = await jarvisClient.get('/api/runs');
      const parsed = runListResponseSchema.parse(raw);
      set({ runs: parsed.data, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load runs';
      set({ error: message, isLoading: false });
    }
  },

  selectRun: async (runId: string) => {
    set({
      selectedRunId: runId,
      events: [],
      artifacts: [],
      isLoadingEvents: true,
      isLoadingArtifacts: true,
    });
    try {
      const [eventsRaw, artifactsRaw] = await Promise.all([
        jarvisClient.get(`/api/runs/${runId}/events`),
        jarvisClient.get(`/api/runs/${runId}/artifacts`),
      ]);
      const eventsParsed = runEventsResponseSchema.parse(eventsRaw);
      const artifactsParsed = runArtifactsResponseSchema.parse(artifactsRaw);
      set({
        events: eventsParsed.data,
        artifacts: artifactsParsed.data,
        isLoadingEvents: false,
        isLoadingArtifacts: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load run details';
      set({ error: message, isLoadingEvents: false, isLoadingArtifacts: false });
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

  cancelRun: async (runId: string) => {
    await jarvisClient.post(`/api/runs/${runId}/cancel`);
    set((state) => ({
      runs: state.runs.map((r) => (r.id === runId ? { ...r, status: 'cancelled' as const } : r)),
    }));
  },

  retryRun: async (runId: string) => {
    await jarvisClient.post(`/api/runs/${runId}/retry`);
    set((state) => ({
      runs: state.runs.map((r) => (r.id === runId ? { ...r, status: 'queued' as const } : r)),
    }));
  },

  fetchRunWithFilter: async (status?: string) => {
    set({ isLoading: true, error: null });
    try {
      const url = status && status !== 'all' ? `/api/runs?status=${status}` : '/api/runs';
      const raw = await jarvisClient.get(url);
      const parsed = runListResponseSchema.parse(raw);
      set({ runs: parsed.data, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load runs';
      set({ error: message, isLoading: false });
    }
  },
}));
