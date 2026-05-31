import type {
  JarvisTool,
  PermissionCheckResult,
  PermissionGuardConfig,
  ToolResult,
  PendingConfirmation,
  PendingExecution,
} from '@jarvis/types';
import { AuditLog } from './audit.js';
import { DEFAULT_PERMISSION_CONFIG, getRiskAction } from './policies.js';

const PENDING_CONFIRMATION_TIMEOUT_MS = 30_000;

export class PermissionGuard {
  private config: PermissionGuardConfig;
  private auditLog: AuditLog;
  private pendingConfirmations: Map<
    string,
    PendingConfirmation & { resolve: (value: boolean) => void }
  > = new Map();

  constructor(config?: Partial<PermissionGuardConfig>) {
    this.config = { ...DEFAULT_PERMISSION_CONFIG, ...config };
    this.auditLog = new AuditLog();
  }

  checkPermission(tool: JarvisTool): PermissionCheckResult {
    const action = getRiskAction(tool.risk, this.config, tool.appId);

    switch (action) {
      case 'auto':
        return {
          allowed: true,
          requiresConfirmation: false,
          riskLevel: tool.risk,
        };
      case 'notify':
        return {
          allowed: true,
          requiresConfirmation: false,
          riskLevel: tool.risk,
          reason: `执行后通知: ${tool.title}`,
        };
      case 'confirm':
        return {
          allowed: true,
          requiresConfirmation: true,
          riskLevel: tool.risk,
          reason: `需要确认: ${tool.title} (风险等级: ${tool.risk})`,
        };
      case 'deny':
        return {
          allowed: false,
          requiresConfirmation: false,
          riskLevel: tool.risk,
          reason: `已拒绝: ${tool.title} (风险等级: ${tool.risk})`,
        };
    }
  }

  async executeWithGuard(
    tool: JarvisTool,
    args: unknown,
    confirmCallback?: (tool: JarvisTool, args: unknown) => Promise<boolean>
  ): Promise<{ result: ToolResult; confirmed: boolean }> {
    const check = this.checkPermission(tool);
    let confirmed = false;

    if (!check.allowed) {
      this.auditLog.log({
        action: 'execute',
        toolId: tool.id,
        toolName: tool.name,
        appId: tool.appId,
        args,
        result: 'denied',
        riskLevel: tool.risk,
        confirmedByUser: false,
        error: check.reason,
      });

      return {
        result: { success: false, error: check.reason },
        confirmed: false,
      };
    }

    if (check.requiresConfirmation && confirmCallback) {
      confirmed = await confirmCallback(tool, args);
      if (!confirmed) {
        this.auditLog.log({
          action: 'execute',
          toolId: tool.id,
          toolName: tool.name,
          appId: tool.appId,
          args,
          result: 'cancelled',
          riskLevel: tool.risk,
          confirmedByUser: false,
        });

        return {
          result: { success: false, error: '用户取消执行' },
          confirmed: false,
        };
      }
    }

    try {
      const result = await tool.execute(args);

      this.auditLog.log({
        action: 'execute',
        toolId: tool.id,
        toolName: tool.name,
        appId: tool.appId,
        args,
        result: result.success ? 'success' : 'failure',
        riskLevel: tool.risk,
        confirmedByUser: confirmed,
        error: result.error,
      });

      return { result, confirmed };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.auditLog.log({
        action: 'execute',
        toolId: tool.id,
        toolName: tool.name,
        appId: tool.appId,
        args,
        result: 'failure',
        riskLevel: tool.risk,
        confirmedByUser: confirmed,
        error: errorMessage,
      });

      return {
        result: { success: false, error: errorMessage },
        confirmed,
      };
    }
  }

  getAuditLog(): AuditLog {
    return this.auditLog;
  }

  updateConfig(config: Partial<PermissionGuardConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setAppPermissions(
    appId: string,
    permissions: PermissionGuardConfig['appPermissions'][string]
  ): void {
    this.config.appPermissions[appId] = permissions;
  }

  async executeWithPendingConfirmation(
    tool: JarvisTool,
    args: unknown,
    options?: { timeoutMs?: number }
  ): Promise<PendingExecution> {
    const check = this.checkPermission(tool);
    const now = new Date();
    const timeoutMs = options?.timeoutMs ?? PENDING_CONFIRMATION_TIMEOUT_MS;
    const confirmationId = crypto.randomUUID();

    // Auto-execute for low/medium risk (no confirmation needed)
    if (!check.requiresConfirmation) {
      const result = await tool.execute(args);
      this.auditLog.log({
        action: 'execute',
        toolId: tool.id,
        toolName: tool.name,
        appId: tool.appId,
        args,
        result: result.success ? 'success' : 'failure',
        riskLevel: tool.risk,
        confirmedByUser: false,
        error: result.error,
      });

      const confirmation: PendingConfirmation = {
        confirmationId,
        toolId: tool.id,
        toolName: tool.name,
        appId: tool.appId,
        args,
        riskLevel: tool.risk,
        reason: check.reason,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + timeoutMs).toISOString(),
      };

      return {
        confirmationId,
        confirmation,
        confirm: async () => result,
        deny: async () => ({ success: false, error: '已自动执行，无法拒绝' }),
        isExpired: false,
      };
    }

    // High/critical risk — create pending confirmation
    const confirmation: PendingConfirmation = {
      confirmationId,
      toolId: tool.id,
      toolName: tool.name,
      appId: tool.appId,
      args,
      riskLevel: tool.risk,
      reason: check.reason,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + timeoutMs).toISOString(),
    };

    let resolved = false;
    let expired = false;

    // Store resolve so confirm/deny can signal the pending promise
    let storedResolve: (value: boolean) => void = () => {};
    new Promise<boolean>((resolve) => {
      storedResolve = resolve;
      this.pendingConfirmations.set(confirmationId, {
        ...confirmation,
        resolve,
      });

      // Auto-expire after timeout
      setTimeout(() => {
        if (!resolved) {
          expired = true;
          this.pendingConfirmations.delete(confirmationId);
          resolve(false);
        }
      }, timeoutMs);
    });

    const confirm = async (): Promise<ToolResult> => {
      if (expired) {
        return { success: false, error: '确认已过期' };
      }
      resolved = true;
      storedResolve(true);
      this.pendingConfirmations.delete(confirmationId);

      const result = await tool.execute(args);
      this.auditLog.log({
        action: 'execute',
        toolId: tool.id,
        toolName: tool.name,
        appId: tool.appId,
        args,
        result: result.success ? 'success' : 'failure',
        riskLevel: tool.risk,
        confirmedByUser: true,
        error: result.error,
      });
      return result;
    };

    const deny = async (): Promise<ToolResult> => {
      if (expired) {
        return { success: false, error: '确认已过期' };
      }
      resolved = true;
      storedResolve(false);
      this.pendingConfirmations.delete(confirmationId);

      this.auditLog.log({
        action: 'execute',
        toolId: tool.id,
        toolName: tool.name,
        appId: tool.appId,
        args,
        result: 'cancelled',
        riskLevel: tool.risk,
        confirmedByUser: false,
      });
      return { success: false, error: '用户拒绝执行' };
    };

    return {
      confirmationId,
      confirmation,
      confirm,
      deny,
      isExpired: expired,
    };
  }

  getPendingConfirmations(): PendingConfirmation[] {
    return Array.from(this.pendingConfirmations.values()).map(({ resolve: _, ...rest }) => rest);
  }

  cancelConfirmation(confirmationId: string): boolean {
    const pending = this.pendingConfirmations.get(confirmationId);
    if (!pending) return false;
    pending.resolve(false);
    this.pendingConfirmations.delete(confirmationId);
    return true;
  }

  cancelAllPending(): number {
    const count = this.pendingConfirmations.size;
    for (const [, pending] of this.pendingConfirmations) {
      pending.resolve(false);
    }
    this.pendingConfirmations.clear();
    return count;
  }
}
