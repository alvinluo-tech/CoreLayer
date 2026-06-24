export interface ExecutionLogRow {
  id: string;
  runId: string;
  executorRunId: string | null;
  workspaceId: string | null;
  projectId: string | null;
  taskId: string | null;
  stream: "stdout" | "stderr" | "system" | "executor";
  sequence: number;
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface CreateExecutionLogInput {
  runId: string;
  executorRunId?: string;
  workspaceId?: string;
  projectId?: string;
  taskId?: string;
  stream: "stdout" | "stderr" | "system" | "executor";
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionLogRepository {
  append(input: CreateExecutionLogInput): Promise<ExecutionLogRow>;
  getByRunId(runId: string, limit?: number): Promise<ExecutionLogRow[]>;
  getTail(runId: string, limit: number): Promise<ExecutionLogRow[]>;
  deleteByRunId(runId: string): Promise<number>;
}
