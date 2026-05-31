import type { PermissionGuardConfig, RiskLevel } from '@jarvis/types';

export const DEFAULT_PERMISSION_CONFIG: PermissionGuardConfig = {
  defaultPolicy: {
    low: 'auto',
    medium: 'notify',
    high: 'confirm',
    critical: 'confirm',
  },
  appPermissions: {},
};

export function getRiskAction(
  risk: RiskLevel,
  config: PermissionGuardConfig,
  appId?: string
): 'auto' | 'notify' | 'confirm' | 'deny' {
  if (appId) {
    const appPerms = config.appPermissions[appId];
    if (appPerms) {
      const riskToAction: Record<RiskLevel, 'auto' | 'notify' | 'confirm' | 'deny'> = {
        low: 'auto',
        medium: appPerms.write ? 'notify' : 'confirm',
        high: appPerms.write ? 'confirm' : 'deny',
        critical: appPerms.execute ? 'confirm' : 'deny',
      };
      return riskToAction[risk];
    }
  }

  return config.defaultPolicy[risk];
}

export function riskFromArgs(args: unknown): RiskLevel {
  if (typeof args !== 'object' || args === null) return 'medium';

  const str = JSON.stringify(args).toLowerCase();

  if (str.includes('delete') || str.includes('remove') || str.includes('drop')) {
    return 'high';
  }
  if (str.includes('bulk') || str.includes('batch') || str.includes('mass')) {
    return 'high';
  }
  if (str.includes('create') || str.includes('update') || str.includes('add')) {
    return 'medium';
  }

  return 'low';
}
