export interface WorkspaceRow {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  goal: string | null;
  status: "draft" | "planning" | "running" | "blocked" | "succeeded" | "failed" | "cancelled";
  activeProjectId: string | null;
  completedAt: string | null;
  settings: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkspaceInput {
  name?: string;
  description?: string;
  ownerId: string;
  goal?: string;
  status?: WorkspaceRow["status"];
  activeProjectId?: string;
  settings?: unknown;
}

export interface UpdateWorkspaceData {
  name?: string;
  description?: string;
  goal?: string;
  status?: WorkspaceRow["status"];
  activeProjectId?: string;
  completedAt?: string;
  settings?: unknown;
}

export interface WorkspaceRepository {
  create(input: CreateWorkspaceInput): Promise<WorkspaceRow>;
  getById(id: string): Promise<WorkspaceRow | null>;
  getByOwnerId(ownerId: string): Promise<WorkspaceRow[]>;
  getDefault(ownerId: string): Promise<WorkspaceRow | null>;
  update(id: string, data: UpdateWorkspaceData): Promise<WorkspaceRow>;
  delete(id: string): Promise<boolean>;
}
