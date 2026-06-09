import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import {
  deleteWorkspace as tauriDeleteWorkspace,
  deleteProject as tauriDeleteProject,
} from '@/lib/tauri';
import { useWorkspaceDetailStore } from '@/stores/workspaceDetailStore';

// ---- Types ----

export interface Workspace {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  settings: unknown;
  createdAt: string;
  updatedAt: string;
  projects?: { id: string }[];
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: 'active' | 'archived' | 'completed';
  settings: unknown;
  createdAt: string;
  updatedAt: string;
}

// ---- Store ----

interface WorkspaceState {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;
  error: string | null;

  loadWorkspaces: () => Promise<void>;
  selectWorkspace: (id: string) => void;
  deleteWorkspace: (id: string) => Promise<void>;
  deleteWorkspaces: (ids: string[]) => Promise<void>;
  loadProjects: (workspaceId: string) => Promise<void>;
  selectProject: (id: string) => void;
  deleteProject: (id: string) => Promise<void>;
  deleteProjects: (ids: string[]) => Promise<void>;
  createProject: (data: { name: string; description?: string }) => Promise<Project>;
  createWorkspace: (name: string, description?: string) => Promise<Workspace>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  currentWorkspace: null,
  projects: [],
  currentProject: null,
  isLoading: false,
  error: null,

  loadWorkspaces: async () => {
    set({ isLoading: true, error: null });
    try {
      const resp = await invoke<{ data: Workspace[] }>('list_workspaces');
      const workspaces = resp.data;
      set((state) => {
        const currentExists = workspaces.some((w) => w.id === state.currentWorkspace?.id);
        return {
          workspaces,
          isLoading: false,
          currentWorkspace: currentExists ? state.currentWorkspace : (workspaces[0] ?? null),
        };
      });
      // Auto-load projects for the current workspace
      const { currentWorkspace } = get();
      if (currentWorkspace) {
        await get().loadProjects(currentWorkspace.id);
      }
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  selectWorkspace: (id: string) => {
    const ws = get().workspaces.find((w) => w.id === id) ?? null;
    set({ currentWorkspace: ws, projects: [], currentProject: null });
    if (ws) {
      get().loadProjects(ws.id);
    }
  },

  deleteWorkspace: async (id: string) => {
    try {
      await tauriDeleteWorkspace(id);
      set((state) => {
        const remaining = state.workspaces.filter((w) => w.id !== id);
        const currentStillExists = remaining.some((w) => w.id === state.currentWorkspace?.id);
        return {
          workspaces: remaining,
          currentWorkspace: currentStillExists ? state.currentWorkspace : (remaining[0] ?? null),
        };
      });
      const { currentWorkspace } = get();
      if (currentWorkspace) {
        await get().loadProjects(currentWorkspace.id);
      }
    } catch (error) {
      set({ error: String(error) });
    }
  },

  deleteWorkspaces: async (ids: string[]) => {
    const idSet = new Set(ids);
    try {
      for (const id of ids) {
        await tauriDeleteWorkspace(id);
      }
      set((state) => {
        const remaining = state.workspaces.filter((w) => !idSet.has(w.id));
        const currentStillExists = remaining.some((w) => w.id === state.currentWorkspace?.id);
        return {
          workspaces: remaining,
          currentWorkspace: currentStillExists ? state.currentWorkspace : (remaining[0] ?? null),
        };
      });
      const { currentWorkspace } = get();
      if (currentWorkspace) {
        await get().loadProjects(currentWorkspace.id);
      }
    } catch (error) {
      set({ error: String(error) });
    }
  },

  loadProjects: async (workspaceId: string) => {
    set({ isLoading: true, error: null });
    try {
      const resp = await invoke<{ data: Project[] }>('list_projects', { workspaceId });
      set({ projects: resp.data, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  selectProject: (id: string) => {
    const project = get().projects.find((p) => p.id === id) ?? null;
    set({ currentProject: project });
  },

  deleteProject: async (id: string) => {
    try {
      await tauriDeleteProject(id);
      set((state) => {
        const remaining = state.projects.filter((p) => p.id !== id);
        const currentStillExists = remaining.some((p) => p.id === state.currentProject?.id);
        return {
          projects: remaining,
          currentProject: currentStillExists ? state.currentProject : null,
        };
      });
      const { currentWorkspace } = get();
      if (currentWorkspace) {
        useWorkspaceDetailStore
          .getState()
          .fetchDetail(currentWorkspace.id)
          .catch(() => {});
      }
    } catch (error) {
      set({ error: String(error) });
    }
  },

  deleteProjects: async (ids: string[]) => {
    const idSet = new Set(ids);
    try {
      for (const id of ids) {
        await tauriDeleteProject(id);
      }
      set((state) => {
        const remaining = state.projects.filter((p) => !idSet.has(p.id));
        const currentStillExists = remaining.some((p) => p.id === state.currentProject?.id);
        return {
          projects: remaining,
          currentProject: currentStillExists ? state.currentProject : null,
        };
      });
      const { currentWorkspace } = get();
      if (currentWorkspace) {
        useWorkspaceDetailStore
          .getState()
          .fetchDetail(currentWorkspace.id)
          .catch(() => {});
      }
    } catch (error) {
      set({ error: String(error) });
    }
  },

  createProject: async (data) => {
    const { currentWorkspace } = get();
    if (!currentWorkspace) throw new Error('No workspace selected');
    try {
      const resp = await invoke<{ data: Project }>('create_project', {
        workspaceId: currentWorkspace.id,
        name: data.name,
        description: data.description ?? null,
      });
      set((state) => ({
        projects: [...state.projects, resp.data],
      }));
      useWorkspaceDetailStore
        .getState()
        .fetchDetail(currentWorkspace.id)
        .catch(() => {});
      return resp.data;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  createWorkspace: async (name: string, description?: string) => {
    try {
      const resp = await invoke<{ data: Workspace }>('create_workspace', {
        name,
        description: description ?? null,
      });
      set((state) => ({
        workspaces: [...state.workspaces, resp.data],
        currentWorkspace: resp.data,
      }));
      return resp.data;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },
}));
