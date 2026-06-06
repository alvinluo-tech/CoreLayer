export type TaskStatus =
  | 'draft'
  | 'queued'
  | 'running'
  | 'blocked'
  | 'failed'
  | 'completed'
  | 'cancelled'
  | 'pending'
  | 'in_progress'
  | 'done'
  | 'deleted';

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  priority: number; // 1-5, 1=highest
  status: TaskStatus;
  dueDate: string | null; // ISO date
  tags: string[];
  completedAt: string | null; // ISO datetime
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
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

export interface CreateTaskInput {
  title: string;
  priority?: number;
  dueDate?: string;
  tags?: string[];
  description?: string;
}

export interface UpdateTaskInput {
  taskId: string;
  title?: string;
  priority?: number;
  status?: TaskStatus;
  dueDate?: string;
  tags?: string[];
}
