/**
 * Operation domain types.
 *
 * An Operation is a deterministic, user-reviewable unit of work
 * that can be planned, previewed, approved, executed, and receipted.
 */

export type OperationRisk = "low" | "medium" | "high" | "critical";

export type OperationKind =
  | "tool.execute"
  | "conversation.cleanup_by_query"
  | "conversation.batch_delete"
  | "file.write"
  | "file.delete"
  | "shell.command"
  | string;

export interface OperationTarget {
  id: string;
  label: string;
  type: string;
}

export interface OperationPreview {
  operationId: string;
  kind: OperationKind;
  title: string;
  summary: string;
  risk: OperationRisk;
  reversible: boolean;
  targetCount?: number;
  targets?: OperationTarget[];
  warnings: string[];
  payload: unknown;
}

export interface OperationReceipt {
  operationId: string;
  kind: OperationKind;
  success: boolean;
  executedAt: string;
  affectedCount: number;
  affectedTargets?: OperationTarget[];
  error?: string;
}
