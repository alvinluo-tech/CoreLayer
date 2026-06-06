import { describe, it, expect } from 'vitest';
import { riskFromArgs, getRiskAction, DEFAULT_PERMISSION_CONFIG } from '../policies.js';
import type { PermissionGuardConfig } from '@jarvis/types';

describe('riskFromArgs', () => {
  it('returns "high" for delete keyword', () => {
    expect(riskFromArgs({ action: 'delete', id: '123' })).toBe('high');
  });

  it('returns "high" for remove keyword', () => {
    expect(riskFromArgs({ target: 'user-remove' })).toBe('high');
  });

  it('returns "high" for drop keyword', () => {
    expect(riskFromArgs({ table: 'drop_users' })).toBe('high');
  });

  it('returns "high" for bulk keyword', () => {
    expect(riskFromArgs({ mode: 'bulk-import' })).toBe('high');
  });

  it('returns "high" for batch keyword', () => {
    expect(riskFromArgs({ type: 'batch' })).toBe('high');
  });

  it('returns "high" for mass keyword', () => {
    expect(riskFromArgs({ operation: 'mass-update' })).toBe('high');
  });

  it('returns "medium" for create keyword', () => {
    expect(riskFromArgs({ action: 'create', name: 'test' })).toBe('medium');
  });

  it('returns "medium" for update keyword', () => {
    expect(riskFromArgs({ action: 'update', id: '1' })).toBe('medium');
  });

  it('returns "medium" for add keyword', () => {
    expect(riskFromArgs({ type: 'add-item' })).toBe('medium');
  });

  it('returns "low" for safe args', () => {
    expect(riskFromArgs({ query: 'list all', page: 1 })).toBe('low');
  });

  it('returns "low" for empty object', () => {
    expect(riskFromArgs({})).toBe('low');
  });

  it('returns "medium" for non-object args (string)', () => {
    expect(riskFromArgs('hello')).toBe('medium');
  });

  it('returns "medium" for non-object args (number)', () => {
    expect(riskFromArgs(42)).toBe('medium');
  });

  it('returns "medium" for null args', () => {
    expect(riskFromArgs(null)).toBe('medium');
  });

  it('returns "medium" for undefined args', () => {
    expect(riskFromArgs(undefined)).toBe('medium');
  });

  it('returns "high" for nested delete keyword', () => {
    expect(riskFromArgs({ data: { nested: { action: 'delete-record' } } })).toBe('high');
  });

  it('is case-insensitive via JSON stringification', () => {
    expect(riskFromArgs({ action: 'DELETE' })).toBe('high');
  });
});

describe('getRiskAction', () => {
  const defaultConfig: PermissionGuardConfig = DEFAULT_PERMISSION_CONFIG;

  it('returns auto for low risk with default config', () => {
    expect(getRiskAction('low', defaultConfig)).toBe('auto');
  });

  it('returns notify for medium risk with default config', () => {
    expect(getRiskAction('medium', defaultConfig)).toBe('notify');
  });

  it('returns confirm for high risk with default config', () => {
    expect(getRiskAction('high', defaultConfig)).toBe('confirm');
  });

  it('returns deny for critical risk with default config', () => {
    expect(getRiskAction('critical', defaultConfig)).toBe('deny');
  });

  it('uses app-specific permission override when appId matches', () => {
    const config: PermissionGuardConfig = {
      ...defaultConfig,
      appPermissions: {
        'test-app': {
          appId: 'test-app',
          read: true,
          write: true,
          delete: false,
          bulkWrite: false,
          execute: true,
        },
      },
    };

    // medium risk + write=true => notify
    expect(getRiskAction('medium', config, 'test-app')).toBe('notify');
    // high risk + write=true => confirm
    expect(getRiskAction('high', config, 'test-app')).toBe('confirm');
    // critical risk + execute=true => confirm
    expect(getRiskAction('critical', config, 'test-app')).toBe('confirm');
  });

  it('falls back to default policy when appId has no permissions', () => {
    const config: PermissionGuardConfig = {
      ...defaultConfig,
      appPermissions: {},
    };

    expect(getRiskAction('high', config, 'unknown-app')).toBe('confirm');
  });

  it('falls back to default policy when no appId is provided', () => {
    expect(getRiskAction('high', defaultConfig)).toBe('confirm');
    expect(getRiskAction('low', defaultConfig)).toBe('auto');
  });

  it('returns auto for low risk even with app-specific config', () => {
    const config: PermissionGuardConfig = {
      ...defaultConfig,
      appPermissions: {
        'test-app': {
          appId: 'test-app',
          read: true,
          write: false,
          delete: false,
          bulkWrite: false,
          execute: false,
        },
      },
    };

    // low risk always maps to auto regardless of app permissions
    expect(getRiskAction('low', config, 'test-app')).toBe('auto');
  });

  it('returns deny for high risk when app has write=false', () => {
    const config: PermissionGuardConfig = {
      ...defaultConfig,
      appPermissions: {
        restricted: {
          appId: 'restricted',
          read: true,
          write: false,
          delete: false,
          bulkWrite: false,
          execute: false,
        },
      },
    };

    expect(getRiskAction('high', config, 'restricted')).toBe('deny');
  });

  it('returns deny for critical risk when app has execute=false', () => {
    const config: PermissionGuardConfig = {
      ...defaultConfig,
      appPermissions: {
        restricted: {
          appId: 'restricted',
          read: true,
          write: true,
          delete: false,
          bulkWrite: false,
          execute: false,
        },
      },
    };

    expect(getRiskAction('critical', config, 'restricted')).toBe('deny');
  });
});
