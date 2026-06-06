import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

// ---- Types ----

export interface Workspace {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  settings: unknown;
  createdAt: string;
  updatedAt: string;
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
  loadProjects: (workspaceId: string) => Promise<void>;
  selectProject: (id: string) => void;
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
