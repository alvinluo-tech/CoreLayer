/**
 * Operations module — Operation Preview layer.
 *
 * Provides deterministic operation planning, execution, and receipt
 * formatting for the approval system.
 */

export type {
  OperationRisk,
  OperationKind,
  OperationTarget,
  OperationPreview,
  OperationReceipt,
} from "./domain/operation.js";

export type { OperationPlanner, PlanContext } from "./planners/operation-planner.js";
export { ConversationCleanupPlanner } from "./planners/conversation-cleanup-planner.js";
export { executeOperation } from "./executors/operation-executor.js";
export { formatReceiptMessage } from "./receipts/operation-receipt.js";
