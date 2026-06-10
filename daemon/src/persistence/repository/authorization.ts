// Approval requests and permission memories

export interface ApprovalRequestRow {
  id: string;
  runId: string;
  toolId: string;
  toolName: string;
  args: unknown;
  risk: string;
  status: "pending" | "approved" | "denied" | "expired" | "executing" | "succeeded" | "failed";
  projectScope: boolean;
  decidedAt: number | null;
  createdAt: number;
  mode: string | null;
  source: string | null;
  preview: string | null;
  toolCallId: string | null;
  expiresAt: number | null;
  operationKind: string | null;
  operationPayload: unknown;
}

export interface CreateApprovalRequestInput {
  id?: string;
  runId: string;
  toolId: string;
  toolName: string;
  args: unknown;
  risk: string;
  projectScope?: boolean;
  mode?: string;
  source?: string;
  preview?: string;
  toolCallId?: string;
  expiresAt?: number;
  operationKind?: string;
  operationPayload?: unknown;
}

export interface ApprovalRequestRepository {
  create(input: CreateApprovalRequestInput): Promise<ApprovalRequestRow>;
  getById(id: string): Promise<ApprovalRequestRow | null>;
  getPending(): Promise<ApprovalRequestRow[]>;
  getByRunId(runId: string): Promise<ApprovalRequestRow[]>;
  findByToolCallId(toolCallId: string): Promise<ApprovalRequestRow | null>;
  approve(id: string): Promise<ApprovalRequestRow>;
  deny(id: string): Promise<ApprovalRequestRow>;
  markExecuting(id: string): Promise<ApprovalRequestRow>;
  markSucceeded(id: string): Promise<ApprovalRequestRow>;
  markFailed(id: string, error: string): Promise<ApprovalRequestRow>;
  expireStale(maxAgeMs?: number): Promise<{ count: number; ids: string[] }>;
}

export interface PermissionMemoryRow {
  id: string;
  userId: string;
  projectId: string | null;
  toolId: string;
  risk: string;
  decision: "auto" | "confirm" | "deny";
  scope: "global" | "project" | "session";
  createdAt: number;
  expiresAt: number | null;
}

export interface CreatePermissionMemoryInput {
  userId?: string;
  projectId?: string | null;
  toolId: string;
  risk: string;
  decision: "auto" | "confirm" | "deny";
  scope?: "global" | "project" | "session";
  expiresAt?: number | null;
}

export interface PermissionMemoryRepository {
  create(input: CreatePermissionMemoryInput): Promise<PermissionMemoryRow>;
  find(toolId: string, userId?: string, projectId?: string): Promise<PermissionMemoryRow | null>;
  getByUserId(userId: string): Promise<PermissionMemoryRow[]>;
  getByProjectId(projectId: string): Promise<PermissionMemoryRow[]>;
  delete(id: string): Promise<boolean>;
}
