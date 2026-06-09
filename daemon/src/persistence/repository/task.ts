export interface TaskRow {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  priority: number;
  status:
    | "draft"
    | "queued"
    | "running"
    | "blocked"
    | "failed"
    | "completed"
    | "cancelled"
    | "pending"
    | "in_progress"
    | "done"
    | "deleted";
  dueDate: string | null;
  tags: string[] | null;
  completedAt: string | null;
  objective: string | null;
  assignedAgentId: string | null;
  parentTaskId: string | null;
  dependencies: string[];
  blockedBy: string[];
  acceptanceCriteria: string[];
  artifacts: unknown[];
  runHistory: unknown[];
  manualInterventionRequired: boolean;
  rollbackPlan: string | null;
  workspaceId: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: number;
  dueDate?: string;
  tags?: string[];
  objective?: string;
  assignedAgentId?: string;
  parentTaskId?: string;
  dependencies?: string[];
  acceptanceCriteria?: string[];
  rollbackPlan?: string;
  workspaceId?: string;
  projectId?: string;
}

export interface TaskFilters {
  status?: string;
  priority?: number;
  dueDateFrom?: string;
  dueDateTo?: string;
  projectId?: string;
  workspaceId?: string;
}

export interface UpdateTaskData {
  title?: string;
  priority?: number;
  status?: string;
  dueDate?: string;
  tags?: string[];
  completedAt?: string;
  objective?: string;
  assignedAgentId?: string;
  parentTaskId?: string;
  dependencies?: string[];
  blockedBy?: string[];
  acceptanceCriteria?: string[];
  artifacts?: unknown[];
  runHistory?: unknown[];
  manualInterventionRequired?: boolean;
  rollbackPlan?: string;
  workspaceId?: string;
  projectId?: string;
}

export interface TaskRepository {
  create(input: CreateTaskInput): Promise<TaskRow>;
  query(filters?: TaskFilters): Promise<TaskRow[]>;
  getById(id: string): Promise<TaskRow | null>;
  update(id: string, data: UpdateTaskData): Promise<TaskRow>;
  delete(id: string): Promise<boolean>;
  getTodayTasks(): Promise<TaskRow[]>;
  getByProjectId(projectId: string): Promise<TaskRow[]>;
  getByWorkspaceId(workspaceId: string): Promise<TaskRow[]>;
  getByParentId(parentTaskId: string): Promise<TaskRow[]>;
  clear(): Promise<number>;
}
