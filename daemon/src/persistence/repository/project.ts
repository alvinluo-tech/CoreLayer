export interface ProjectRow {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  spec: string | null;
  techStack: string | null;
  rootPath: string | null;
  status: "active" | "archived" | "completed";
  settings: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  workspaceId: string;
  name: string;
  description?: string;
  spec?: string;
  techStack?: string;
  rootPath?: string;
  status?: ProjectRow["status"];
  settings?: unknown;
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
  spec?: string;
  techStack?: string;
  rootPath?: string;
  status?: ProjectRow["status"];
  settings?: unknown;
}

export interface ProjectRepository {
  create(input: CreateProjectInput): Promise<ProjectRow>;
  getById(id: string): Promise<ProjectRow | null>;
  getByWorkspaceId(workspaceId: string): Promise<ProjectRow[]>;
  getActiveByWorkspaceId(workspaceId: string): Promise<ProjectRow[]>;
  update(id: string, data: UpdateProjectData): Promise<ProjectRow>;
  delete(id: string): Promise<boolean>;
}
