/**
 * Computer Control Runtime — manages direct OS interactions.
 *
 * All operations go through OSCapabilityBroker for permission checks.
 * All operations are high/critical risk by default.
 * Screenshot/screen content is sensitive data that must be audited
 * and can be disabled by the user.
 */

import type {
  ComputerControlOperation,
  ComputerControlRequest,
  ComputerControlResult,
  ComputerControlRuntimeStatus,
  ComputerControlPermissionStatus,
} from "./types.js";
import { COMPUTER_CONTROL_RISK } from "./types.js";
import { getCapabilityBroker } from "../capabilities/os-capability-broker.js";
import { getRepositories } from "../db/factory.js";

/**
 * In-memory permission overrides.
 * Keyed by operation, stores user's blanket approval or denial.
 */
const permissionOverrides = new Map<ComputerControlOperation, boolean>();

/** Whether screen capture is globally enabled */
let screenCaptureEnabled = true;

/** Runtime counters */
let totalRequests = 0;
let deniedRequests = 0;
let approvedRequests = 0;

/**
 * Request a computer control operation.
 * Goes through OSCapabilityBroker for permission check.
 */
export async function requestComputerControl(
  request: ComputerControlRequest,
): Promise<ComputerControlResult> {
  totalRequests++;

  const { operation } = request;
  const riskLevel = COMPUTER_CONTROL_RISK[operation];

  // Screen capture guard — user can disable all screenshots/screen content
  if (
    (operation === "screenshot") &&
    !screenCaptureEnabled
  ) {
    deniedRequests++;
    return {
      success: false,
      operation,
      denied: true,
      deniedReason: "Screen capture is disabled by user preference",
    };
  }

  // Check blanket permission override
  const override = permissionOverrides.get(operation);
  if (override === false) {
    deniedRequests++;
    await auditDecision(request, "deny", "User revoked blanket permission");
    return {
      success: false,
      operation,
      denied: true,
      deniedReason: "Operation disabled by user permission settings",
    };
  }

  // Request through OSCapabilityBroker
  const broker = getCapabilityBroker();
  const decision = await broker.requestCapability({
    actorId: request.actorId,
    agentRunId: request.agentRunId,
    taskId: request.taskId,
    projectId: request.projectId,
    capability: "window.control",
    resource: `${operation}:${request.coordinates ? `${request.coordinates.x},${request.coordinates.y}` : "no-coords"}`,
    riskLevel,
    proposedAction: "capture",
    reason: request.reason,
  });

  if (decision.decision === "deny") {
    deniedRequests++;
    return {
      success: false,
      operation,
      denied: true,
      deniedReason: decision.reason,
    };
  }

  if (decision.decision === "approval_required") {
    // Return pending — the approval inbox will handle the rest
    return {
      success: false,
      operation,
      denied: true,
      deniedReason: `Approval required: ${decision.reason}`,
    };
  }

  approvedRequests++;

  // Audit screenshot operations as sensitive data
  if (operation === "screenshot") {
    await auditScreenshot(request);
  }

  // Placeholder: actual OS interaction would happen here via Rust Core
  // For now, return a successful result with no data
  return {
    success: true,
    operation,
  };
}

/**
 * Set a blanket permission override for an operation.
 * true = always allow, false = always deny.
 */
export function setComputerControlPermission(
  operation: ComputerControlOperation,
  allowed: boolean,
): void {
  permissionOverrides.set(operation, allowed);
}

/**
 * Enable or disable screen capture globally.
 */
export function setScreenCaptureEnabled(enabled: boolean): void {
  screenCaptureEnabled = enabled;
}

/**
 * Revoke all blanket permission overrides.
 */
export function revokeAllPermissions(): void {
  permissionOverrides.clear();
}

/**
 * Get the current permission status for all computer control operations.
 */
export function getPermissionStatuses(): ComputerControlPermissionStatus[] {
  const operations: ComputerControlOperation[] = [
    "screenshot", "window.list", "window.focus", "window.close",
    "click", "double_click", "right_click", "type_text",
    "key_press", "key_combo", "scroll", "file_select", "drag",
  ];

  return operations.map((operation) => ({
    operation,
    enabled: permissionOverrides.get(operation) !== false,
    riskLevel: COMPUTER_CONTROL_RISK[operation],
    blanketApproved: permissionOverrides.get(operation) === true,
    screenCaptureAllowed: operation === "screenshot" ? screenCaptureEnabled : true,
  }));
}

/**
 * Get the runtime status.
 */
export function getComputerControlStatus(): ComputerControlRuntimeStatus {
  return {
    active: true,
    totalRequests,
    deniedRequests,
    approvedRequests,
    screenCaptureEnabled,
    permissions: getPermissionStatuses(),
  };
}

/**
 * Reset runtime counters (for testing).
 */
export function resetComputerControlState(): void {
  totalRequests = 0;
  deniedRequests = 0;
  approvedRequests = 0;
  permissionOverrides.clear();
  screenCaptureEnabled = true;
}

/** Audit a screenshot capture as sensitive data */
async function auditScreenshot(request: ComputerControlRequest): Promise<void> {
  try {
    const { auditLog } = getRepositories();
    await auditLog.create({
      actor: request.actorId,
      action: "computer-control.screenshot",
      resource: "screen",
      riskLevel: "high",
      permissionDecision: "allow",
      confirmedByUser: false,
      result: "captured",
      metadata: {
        operation: "screenshot",
        agentRunId: request.agentRunId,
        taskId: request.taskId,
        projectId: request.projectId,
        sensitiveData: true,
      },
    });
  } catch {
    // Best-effort audit logging
  }
}

/** Audit a permission decision */
async function auditDecision(
  request: ComputerControlRequest,
  decision: string,
  reason: string,
): Promise<void> {
  try {
    const { auditLog } = getRepositories();
    await auditLog.create({
      actor: request.actorId,
      action: `computer-control.${request.operation}`,
      resource: `${request.operation}`,
      riskLevel: COMPUTER_CONTROL_RISK[request.operation],
      permissionDecision: decision as "allow" | "deny" | "approval_required",
      confirmedByUser: false,
      result: "denied",
      metadata: {
        operation: request.operation,
        reason,
        agentRunId: request.agentRunId,
        taskId: request.taskId,
      },
    });
  } catch {
    // Best-effort audit logging
  }
}
