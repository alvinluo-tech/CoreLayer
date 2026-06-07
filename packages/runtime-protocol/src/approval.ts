/**
 * Non-blocking approval result returned by ToolRuntime.execute when
 * user confirmation is required. All fields are JSON-serializable —
 * no functions, no circular references.
 */
export interface ApprovalRequiredResult {
  /** Discriminant for result type checking */
  readonly kind: 'approval_required';
  /** Approval request ID (matches DB approval_requests.id) */
  readonly approvalRequestId: string;
  /** Agent run that triggered this tool call */
  readonly runId: string;
  /** Tool call ID for idempotent dedup */
  readonly toolCallId: string | null;
  /** Tool being executed */
  readonly toolId: string;
  readonly toolName: string;
  /** What kind of operation to resume after approval */
  readonly operationKind: OperationKind;
  /** Serializable payload needed to re-execute after approval */
  readonly operationPayload: OperationPayload;
  /** Who initiated the call */
  readonly actor: string;
  /** Execution mode */
  readonly mode: string;
  /** Project scope */
  readonly projectId: string | null;
  /** Task scope */
  readonly taskId: string | null;
  /** Conversation scope */
  readonly conversationId: string | null;
  /** Tool source category */
  readonly source: string | null;
  /** Human-readable description of what will happen */
  readonly preview: string | null;
  /** Risk level */
  readonly risk: string;
  /** When this approval was created (ISO timestamp) */
  readonly createdAt: string;
  /** When this approval expires (ISO timestamp, nullable) */
  readonly expiresAt: string | null;
}

/**
 * Kind of operation that needs approval.
 * Each kind maps to a specific resume strategy.
 */
export type OperationKind = 'tool.execute';

/**
 * Serializable payload for resuming an operation after approval.
 * The shape depends on operationKind.
 */
export interface ToolExecutePayload {
  /** Tool input arguments (JSON-serializable) */
  readonly args: unknown;
}

export type OperationPayload = ToolExecutePayload;

/**
 * Type guard for ApprovalRequiredResult.
 */
export function isApprovalRequiredResult(result: unknown): result is ApprovalRequiredResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    (result as Record<string, unknown>).kind === 'approval_required'
  );
}
