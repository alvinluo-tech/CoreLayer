import type { RiskLevel, ToolResult } from './tool.js';

export type PermissionAction = 'read' | 'write' | 'delete' | 'bulkWrite' | 'execute';

export interface Permission {
  appId: string;
  action: PermissionAction;
  granted: boolean;
}

export interface PermissionSet {
  appId: string;
  read: boolean;
  write: boolean;
  delete: boolean;
  bulkWrite: boolean;
  execute: boolean;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  requiresConfirmation: boolean;
  riskLevel: RiskLevel;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  toolId: string;
  toolName: string;
  appId: string;
  args: unknown;
  result: 'success' | 'failure' | 'denied' | 'cancelled';
  riskLevel: RiskLevel;
  confirmedByUser: boolean;
  userId?: string;
  error?: string;
}

export interface PermissionGuardConfig {
  defaultPolicy: {
    low: 'auto' | 'notify' | 'confirm';
    medium: 'auto' | 'notify' | 'confirm';
    high: 'auto' | 'notify' | 'confirm';
    critical: 'auto' | 'notify' | 'confirm' | 'deny';
  };
  appPermissions: Record<string, PermissionSet>;
}

export interface PendingConfirmation {
  confirmationId: string;
  toolId: string;
  toolName: string;
  appId: string;
  args: unknown;
  riskLevel: RiskLevel;
  reason?: string;
  createdAt: string;
  expiresAt: string;
}

export interface PendingExecution {
  confirmationId: string;
  confirmation: PendingConfirmation;
  confirm: () => Promise<ToolResult>;
  deny: () => Promise<ToolResult>;
  isExpired: boolean;
}
