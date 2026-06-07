import { PermissionGuard } from "@jarvis/permission-guard";
import { getRepositories } from "../persistence/factory.js";

/**
 * Bridges the in-memory PermissionGuard confirmations with database-backed
 * approval_requests and permission_memories tables.
 *
 * - Creates DB records for approval requests
 * - Checks permission_memories before asking for user confirmation
 * - Resolves in-memory confirmations when API approves/denies
 */
export class ApprovalManager {
  private permissionGuard: PermissionGuard;

  constructor(permissionGuard: PermissionGuard) {
    this.permissionGuard = permissionGuard;
  }

  /**
   * Check if a permission memory exists for this tool/risk combo.
   * Returns the stored decision if found, null otherwise.
   */
  async checkPermissionMemory(
    toolId: string,
    _risk: string,
    userId = "default",
    projectId?: string,
  ): Promise<"auto" | "confirm" | "deny" | null> {
    const { permissionMemories } = getRepositories();
    const memory = await permissionMemories.find(toolId, userId, projectId);
    return memory?.decision ?? null;
  }

  /**
   * Resolve an in-memory pending confirmation by its ID.
   * This is called when the user approves or denies via the API.
   */
  resolveConfirmation(confirmationId: string, approved: boolean): boolean {
    return this.permissionGuard.resolvePendingConfirmation(confirmationId, approved);
  }

  /**
   * Get all pending in-memory confirmations (for UI display).
   */
  getPendingConfirmations() {
    return this.permissionGuard.getPendingConfirmations();
  }

  /**
   * Get the underlying permission guard (for integration with ToolRuntime).
   */
  getPermissionGuard(): PermissionGuard {
    return this.permissionGuard;
  }
}
