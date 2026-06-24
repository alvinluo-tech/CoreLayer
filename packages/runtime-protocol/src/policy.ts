/**
 * Policy Decision Types — structured policy evaluation results.
 */

import type { RiskLevel } from './actions.js';

/** Policy decision kinds */
export type PolicyDecisionKind =
  | 'allow'
  | 'deny'
  | 'require_approval'
  | 'require_plan_approval'
  | 'hard_deny';

/** Scope request for capability grants */
export interface CapabilityScopeRequest {
  level: 'run' | 'task' | 'workspace' | 'project';
  id: string;
}

/** Policy decision result */
export interface PolicyDecision {
  /** Decision kind */
  decision: PolicyDecisionKind;
  /** Risk level of the action */
  risk: RiskLevel;
  /** Human-readable reason */
  reason: string;
  /** Matched grant ID if allowed by a grant */
  matchedGrantId?: string;
  /** Required scope if approval is needed */
  requiredScope?: CapabilityScopeRequest;
  /** Matched hardline rule ID if hard-denied */
  hardlineRuleId?: string;
}
