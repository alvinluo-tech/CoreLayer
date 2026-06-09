import { invoke } from '@tauri-apps/api/core';
import type { Workspace, Project } from '@/stores/workspaceStore';

export async function listWorkspaces(): Promise<{ data: Workspace[] }> {
  return invoke('list_workspaces');
}

export async function createWorkspace(
  name: string,
  description?: string
): Promise<{ data: Workspace }> {
  return invoke('create_workspace', { name, description: description ?? null });
}

export async function updateWorkspace(
  id: string,
  data: { name?: string; description?: string }
): Promise<{ data: Workspace }> {
  return invoke('update_workspace', {
    id,
    name: data.name ?? null,
    description: data.description ?? null,
  });
}

export async function deleteWorkspace(id: string): Promise<{ success: boolean }> {
  return invoke('delete_workspace', { id });
}

export async function listProjects(workspaceId: string): Promise<{ data: Project[] }> {
  return invoke('list_projects', { workspaceId });
}

export async function createProject(
  workspaceId: string,
  name: string,
  description?: string
): Promise<{ data: Project }> {
  return invoke('create_project', {
    workspaceId,
    name,
    description: description ?? null,
  });
}

export async function updateProject(
  id: string,
  data: { name?: string; description?: string; status?: string }
): Promise<{ data: Project }> {
  return invoke('update_project', {
    id,
    name: data.name ?? null,
    description: data.description ?? null,
    status: data.status ?? null,
  });
}

export async function deleteProject(id: string): Promise<{ success: boolean }> {
  return invoke('delete_project', { id });
}
