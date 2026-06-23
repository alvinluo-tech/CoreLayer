export interface ExecutorRunRow {
  id: string;
  agentRunId: string | null;
  workspaceId: string | null;
  projectId: string | null;
  taskId: string | null;
  agentId: string | null;
  adapterId: string;
  domain: string;
  status: ExecutorRunStatus;
  taskPrompt: string;
  environmentKind: string;
  environmentConfig: Record<string, unknown>;
  workingDirectory: string | null;
  pid: number | null;
  exitCode: number | null;
  error: string | null;
  failureCategory: string | null;
  timeoutMs: number | null;
  artifacts: Record<string, unknown>;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
}

export type ExecutorRunStatus =
  | "created"
  | "queued"
  | "preparing_environment"
  | "waiting_for_permission"
  | "starting_executor"
  | "running"
  | "waiting_for_executor_input"
  | "collecting_artifacts"
  | "verifying"
  | "needs_retry"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed_out"
  | "cleanup_failed";

export interface CreateExecutorRunInput {
  agentRunId?: string;
  workspaceId?: string;
  projectId?: string;
  taskId?: string;
  agentId?: string;
  adapterId: string;
  domain?: string;
  taskPrompt: string;
  environmentKind?: string;
  environmentConfig?: Record<string, unknown>;
  workingDirectory?: string;
  timeoutMs?: number;
}

export interface UpdateExecutorRunInput {
  status?: ExecutorRunStatus;
  pid?: number;
  exitCode?: number;
  error?: string;
  failureCategory?: string;
  environmentConfig?: Record<string, unknown>;
  workingDirectory?: string;
  artifacts?: Record<string, unknown>;
  completedAt?: string;
  durationMs?: number;
}

export interface ExecutorRunRepository {
  create(input: CreateExecutorRunInput): Promise<ExecutorRunRow>;
  getById(id: string): Promise<ExecutorRunRow | null>;
  getByAgentRun(agentRunId: string): Promise<ExecutorRunRow[]>;
  getByWorkspace(workspaceId: string, limit?: number): Promise<ExecutorRunRow[]>;
  getActive(limit?: number): Promise<ExecutorRunRow[]>;
  update(id: string, data: UpdateExecutorRunInput): Promise<void>;
  updateStatus(id: string, status: ExecutorRunStatus, error?: string): Promise<void>;
}
