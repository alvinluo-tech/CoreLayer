/**
 * Operation Planner interface.
 *
 * Planners convert raw tool call arguments into deterministic,
 * user-reviewable OperationPreview objects. The preview is what
 * the user sees and approves — not the raw tool args.
 */

import type { OperationPreview } from "../domain/operation.js";

export interface PlanContext {
  conversationId?: string;
  projectId?: string;
  workspaceId?: string;
}

export interface OperationPlanner {
  /** The tool ID this planner handles */
  readonly toolId: string;

  /**
   * Generate an OperationPreview from tool call arguments.
   * The preview must be deterministic — same inputs produce same targets.
   */
  plan(args: unknown, context: PlanContext): Promise<OperationPreview>;
}
