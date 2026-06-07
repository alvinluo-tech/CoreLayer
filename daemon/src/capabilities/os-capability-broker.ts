/**
 * OSCapabilityBroker — the main entry point for OS capability requests.
 *
 * Agents do not directly access OS capabilities. They request them through
 * this broker, which:
 * 1. Evaluates the request via PermissionBroker
 * 2. Writes all decisions to the persistent AuditLog
 * 3. Returns the decision to the caller
 */

import type {
  CapabilityRequest,
  CapabilityDecisionResult,
} from "./types.js";
import { PermissionBroker } from "./permission-broker.js";
import { getRepositories } from "../persistence/factory.js";

export class OSCapabilityBroker {
  private permissionBroker: PermissionBroker;

  constructor(permissionBroker?: PermissionBroker) {
    this.permissionBroker = permissionBroker ?? new PermissionBroker();
  }

  /**
   * Request an OS capability. Returns the decision and logs it to AuditLog.
   */
  async requestCapability(request: CapabilityRequest): Promise<CapabilityDecisionResult> {
    const decision = this.permissionBroker.evaluate(request);

    // Write to persistent audit log
    try {
      const { auditLog } = getRepositories();
      await auditLog.create({
        actor: request.actorId,
        action: `capability.${request.capability}`,
        resource: request.resource,
        riskLevel: request.riskLevel,
        permissionDecision: decision.decision,
        confirmedByUser: decision.decision === "allow",
        result: decision.decision === "deny" ? "denied" : "pending",
        metadata: {
          capability: request.capability,
          proposedAction: request.proposedAction,
          reason: request.reason,
          agentRunId: request.agentRunId,
          taskId: request.taskId,
          projectId: request.projectId,
          allowlistMatch: decision.allowlistMatch,
          brokerReason: decision.reason,
        },
      });
    } catch {
      // Best-effort audit logging — don't fail the request
    }

    return decision;
  }

  /**
   * Convenience: request file read.
   */
  async requestFileRead(
    actorId: string,
    filePath: string,
    opts?: { agentRunId?: string; taskId?: string; projectId?: string },
  ): Promise<CapabilityDecisionResult> {
    return this.requestCapability({
      actorId,
      capability: "file.read",
      resource: filePath,
      riskLevel: "low",
      proposedAction: "read",
      ...opts,
    });
  }

  /**
   * Convenience: request file write with diff.
   */
  async requestFileWrite(
    actorId: string,
    filePath: string,
    proposedPatch?: string,
    opts?: { agentRunId?: string; taskId?: string; projectId?: string },
  ): Promise<CapabilityDecisionResult> {
    return this.requestCapability({
      actorId,
      capability: "file.write",
      resource: filePath,
      riskLevel: "medium",
      proposedAction: proposedPatch ? "patch" : "write",
      proposedPatch,
      ...opts,
    });
  }

  /**
   * Convenience: request file deletion.
   */
  async requestFileDelete(
    actorId: string,
    filePath: string,
    opts?: { agentRunId?: string; taskId?: string; projectId?: string },
  ): Promise<CapabilityDecisionResult> {
    return this.requestCapability({
      actorId,
      capability: "file.delete",
      resource: filePath,
      riskLevel: "high",
      proposedAction: "delete",
      ...opts,
    });
  }

  /**
   * Convenience: request shell command execution.
   */
  async requestShellExec(
    actorId: string,
    command: string,
    opts?: { agentRunId?: string; taskId?: string; projectId?: string; reason?: string },
  ): Promise<CapabilityDecisionResult> {
    return this.requestCapability({
      actorId,
      capability: "shell.exec",
      resource: command,
      riskLevel: "critical",
      proposedAction: "execute",
      command,
      ...opts,
    });
  }

  /**
   * Get the PermissionBroker for direct access.
   */
  getPermissionBroker(): PermissionBroker {
    return this.permissionBroker;
  }
}

/** Singleton instance */
let _broker: OSCapabilityBroker | null = null;

export function getCapabilityBroker(): OSCapabilityBroker {
  if (!_broker) {
    _broker = new OSCapabilityBroker();
  }
  return _broker;
}
