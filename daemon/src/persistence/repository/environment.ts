export type EnvironmentState =
  | "created"
  | "preparing"
  | "ready"
  | "active"
  | "paused"
  | "completed"
  | "failed"
  | "disposed";

export interface EnvironmentSessionRow {
  id: string;
  workspaceId: string;
  projectId: string | null;
  runId: string | null;
  agentId: string | null;
  environmentKind: string;
  state: EnvironmentState;
  workingDirectory: string | null;
  accessPolicy: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEnvironmentSessionInput {
  workspaceId: string;
  projectId?: string;
  runId?: string;
  agentId?: string;
  environmentKind: string;
  workingDirectory?: string;
  accessPolicy?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateEnvironmentSessionInput {
  state?: EnvironmentState;
  workingDirectory?: string;
  accessPolicy?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface EnvironmentEventRow {
  id: string;
  sessionId: string;
  sequence: number;
  type: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface CreateEnvironmentEventInput {
  sessionId: string;
  type: string;
  payload?: Record<string, unknown>;
}

export interface EnvironmentSessionRepository {
  create(input: CreateEnvironmentSessionInput): Promise<EnvironmentSessionRow>;
  getById(id: string): Promise<EnvironmentSessionRow | null>;
  getByRun(runId: string): Promise<EnvironmentSessionRow[]>;
  getByWorkspace(workspaceId: string, limit?: number): Promise<EnvironmentSessionRow[]>;
  getActive(limit?: number): Promise<EnvironmentSessionRow[]>;
  update(id: string, data: UpdateEnvironmentSessionInput): Promise<void>;
  updateState(id: string, state: EnvironmentState): Promise<void>;
  dispose(id: string): Promise<void>;
}

export interface EnvironmentEventRepository {
  create(input: CreateEnvironmentEventInput): Promise<EnvironmentEventRow>;
  getBySession(sessionId: string, limit?: number): Promise<EnvironmentEventRow[]>;
  getNextSequence(sessionId: string): Promise<number>;
}
