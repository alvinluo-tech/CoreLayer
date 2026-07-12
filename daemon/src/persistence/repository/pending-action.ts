import type { RuntimeAction } from "@jarvis/runtime-protocol";

export type PendingActionStatus =
  | "blocked" | "approved" | "resuming" | "executing"
  | "completed" | "failed" | "cancelled" | "expired";

export type PendingActionResumeStrategy =
  | "native_session_resume" | "prompted_reentry" | "manual_block";

export interface PendingActionRow {
  id: string;
  approvalRequestId: string;
  runId: string;
  executorRunId: string | null;
  workspaceId: string | null;
  projectId: string | null;
  taskId: string | null;
  actionFingerprint: string;
  actionPayload: RuntimeAction;
  resumePayload: {
    strategy: PendingActionResumeStrategy;
    executorSessionId?: string;
    nativeActionId?: string;
  };
  status: PendingActionStatus;
  error: string | null;
  result: unknown | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CreatePendingActionInput {
  approvalRequestId: string;
  runId: string;
  executorRunId?: string;
  workspaceId?: string;
  projectId?: string;
  taskId?: string;
  actionFingerprint: string;
  actionPayload: RuntimeAction;
  resumePayload: PendingActionRow["resumePayload"];
}

export interface PendingActionRepository {
  create(input: CreatePendingActionInput): Promise<PendingActionRow>;
  getById(id: string): Promise<PendingActionRow | null>;
  getByFingerprint(fingerprint: string): Promise<PendingActionRow | null>;
  getByApprovalRequest(approvalRequestId: string): Promise<PendingActionRow | null>;
  getOpenByWorkspace(workspaceId: string): Promise<PendingActionRow[]>;
  transition(
    id: string,
    from: PendingActionStatus[],
    to: PendingActionStatus,
    error?: string,
    result?: unknown,
  ): Promise<PendingActionRow | null>;
  deleteAll(): Promise<void>;
}
