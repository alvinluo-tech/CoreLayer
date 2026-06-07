/**
 * OS Capability types for the Agent OS permission boundary.
 *
 * OSCapabilityBroker defines what operations an agent can request.
 * PermissionBroker decides allow/deny/approval_required.
 */

import type { RiskLevel } from "@jarvis/types";

/** OS-level capabilities that agents can request */
export type OSCapability =
  | "file.read"
  | "file.write"
  | "file.delete"
  | "dir.list"
  | "dir.select"
  | "shell.exec"
  | "screenshot"
  | "window.control"
  | "notification"
  | "network.request";

/** The proposed action for a capability request */
export type CapabilityAction =
  | "read"
  | "write"
  | "patch"
  | "delete"
  | "execute"
  | "list"
  | "capture";

/** Decision returned by the PermissionBroker */
export type CapabilityDecision =
  | "allow"
  | "deny"
  | "approval_required";

/** A request for an OS capability */
export interface CapabilityRequest {
  actorId: string;
  agentRunId?: string;
  taskId?: string;
  projectId?: string;
  capability: OSCapability;
  resource: string;
  reason?: string;
  riskLevel: RiskLevel;
  proposedAction: CapabilityAction;
  /** For file.write: the proposed diff or patch content */
  proposedPatch?: string;
  /** For shell.exec: the command to execute */
  command?: string;
}

/** Decision result from the PermissionBroker */
export interface CapabilityDecisionResult {
  decision: CapabilityDecision;
  reason: string;
  /** If approval_required, the approval request ID */
  approvalRequestId?: string;
  /** For shell.exec: matched allowlist rule, if any */
  allowlistMatch?: string;
}

/** Shell allowlist rule */
export interface ShellAllowlistRule {
  /** Pattern to match (prefix match on command string) */
  pattern: string;
  /** Description of what this rule allows */
  description: string;
  /** Risk level override for this pattern */
  riskOverride?: RiskLevel;
}
