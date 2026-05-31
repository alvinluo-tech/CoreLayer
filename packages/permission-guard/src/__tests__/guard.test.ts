import { describe, it, expect } from 'vitest';
import { PermissionGuard } from '../guard.js';
import type { JarvisTool } from '@jarvis/types';

function createTestTool(overrides: Partial<JarvisTool> = {}): JarvisTool {
  return {
    id: 'test:tool1',
    appId: 'test-app',
    source: 'native',
    name: 'testTool',
    title: 'Test Tool',
    description: 'A test tool',
    inputSchema: { type: 'object' },
    risk: 'low',
    permissions: [],
    requiresConfirmation: false,
    execute: async () => ({ success: true, data: 'ok' }),
    ...overrides,
  };
}

describe('PermissionGuard', () => {
  it('allows low risk tools automatically', () => {
    const guard = new PermissionGuard();
    const tool = createTestTool({ risk: 'low' });

    const result = guard.checkPermission(tool);
    expect(result.allowed).toBe(true);
    expect(result.requiresConfirmation).toBe(false);
  });

  it('allows medium risk tools with notify', () => {
    const guard = new PermissionGuard();
    const tool = createTestTool({ risk: 'medium' });

    const result = guard.checkPermission(tool);
    expect(result.allowed).toBe(true);
    expect(result.requiresConfirmation).toBe(false);
    expect(result.reason).toContain('执行后通知');
  });

  it('requires confirmation for high risk tools', () => {
    const guard = new PermissionGuard();
    const tool = createTestTool({ risk: 'high' });

    const result = guard.checkPermission(tool);
    expect(result.allowed).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.reason).toContain('需要确认');
  });

  it('executes low risk tools directly', async () => {
    const guard = new PermissionGuard();
    const tool = createTestTool({ risk: 'low' });

    const { result } = await guard.executeWithGuard(tool, {});
    expect(result.success).toBe(true);
    expect(result.data).toBe('ok');
  });

  it('executes medium risk tools without confirmation', async () => {
    const guard = new PermissionGuard();
    const tool = createTestTool({ risk: 'medium' });

    const { result } = await guard.executeWithGuard(tool, {});
    expect(result.success).toBe(true);
  });

  it('waits for confirmation on high risk tools', async () => {
    const guard = new PermissionGuard();
    const tool = createTestTool({ risk: 'high' });

    const { result, confirmed } = await guard.executeWithGuard(
      tool,
      {},
      async () => true // user confirms
    );
    expect(result.success).toBe(true);
    expect(confirmed).toBe(true);
  });

  it('cancels execution when user denies confirmation', async () => {
    const guard = new PermissionGuard();
    const tool = createTestTool({ risk: 'high' });

    const { result, confirmed } = await guard.executeWithGuard(
      tool,
      {},
      async () => false // user denies
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('用户取消');
    expect(confirmed).toBe(false);
  });

  it('logs audit entries for executed tools', async () => {
    const guard = new PermissionGuard();
    const tool = createTestTool({ risk: 'low' });

    await guard.executeWithGuard(tool, { test: true });

    const auditLog = guard.getAuditLog();
    expect(auditLog.size).toBe(1);

    const entries = auditLog.getEntries();
    expect(entries[0].toolName).toBe('testTool');
    expect(entries[0].result).toBe('success');
    expect(entries[0].riskLevel).toBe('low');
  });

  it('logs denied entries when user cancels', async () => {
    const guard = new PermissionGuard();
    const tool = createTestTool({ risk: 'high' });

    await guard.executeWithGuard(tool, {}, async () => false);

    const auditLog = guard.getAuditLog();
    const denied = auditLog.getDeniedEntries();
    expect(denied).toHaveLength(0); // cancelled, not denied

    const entries = auditLog.getEntries();
    expect(entries[0].result).toBe('cancelled');
  });

  it('logs failure when tool execution throws', async () => {
    const guard = new PermissionGuard();
    const tool = createTestTool({
      risk: 'low',
      execute: async () => {
        throw new Error('Tool failed');
      },
    });

    const { result } = await guard.executeWithGuard(tool, {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('Tool failed');

    const entries = guard.getAuditLog().getEntries();
    expect(entries[0].result).toBe('failure');
  });

  it('respects custom app permissions', () => {
    const guard = new PermissionGuard();
    guard.setAppPermissions('restricted-app', {
      appId: 'restricted-app',
      read: true,
      write: false,
      delete: false,
      bulkWrite: false,
      execute: false,
    });

    const tool = createTestTool({ appId: 'restricted-app', risk: 'medium' });
    const result = guard.checkPermission(tool);
    expect(result.requiresConfirmation).toBe(true);
  });

  it('auto-executes low risk tools via pending confirmation', async () => {
    const guard = new PermissionGuard();
    const tool = createTestTool({ risk: 'low' });

    const pending = await guard.executeWithPendingConfirmation(tool, {});
    expect(pending.confirmation.riskLevel).toBe('low');
    // Should have already executed
    const result = await pending.confirm();
    expect(result.success).toBe(true);
    expect(pending.isExpired).toBe(false);
  });

  it('creates pending confirmation for high risk tools', async () => {
    const guard = new PermissionGuard();
    const tool = createTestTool({ risk: 'high' });

    const pending = await guard.executeWithPendingConfirmation(tool, { data: 'test' });
    expect(pending.confirmation.riskLevel).toBe('high');
    expect(pending.confirmation.toolId).toBe('test:tool1');
    expect(pending.confirmation.args).toEqual({ data: 'test' });

    // Should be in pending list
    const pendingList = guard.getPendingConfirmations();
    expect(pendingList).toHaveLength(1);
    expect(pendingList[0].confirmationId).toBe(pending.confirmationId);
  });

  it('confirms high risk tool execution', async () => {
    const guard = new PermissionGuard();
    const tool = createTestTool({ risk: 'high' });

    const pending = await guard.executeWithPendingConfirmation(tool, {});
    const result = await pending.confirm();
    expect(result.success).toBe(true);

    // Should be removed from pending list
    expect(guard.getPendingConfirmations()).toHaveLength(0);
  });

  it('denies high risk tool execution', async () => {
    const guard = new PermissionGuard();
    const tool = createTestTool({ risk: 'high' });

    const pending = await guard.executeWithPendingConfirmation(tool, {});
    const result = await pending.deny();
    expect(result.success).toBe(false);
    expect(result.error).toContain('拒绝');

    expect(guard.getPendingConfirmations()).toHaveLength(0);
  });

  it('cancels a specific pending confirmation', async () => {
    const guard = new PermissionGuard();
    const tool = createTestTool({ risk: 'high' });

    const pending = await guard.executeWithPendingConfirmation(tool, {});
    expect(guard.getPendingConfirmations()).toHaveLength(1);

    const cancelled = guard.cancelConfirmation(pending.confirmationId);
    expect(cancelled).toBe(true);
    expect(guard.getPendingConfirmations()).toHaveLength(0);
  });

  it('returns false when cancelling nonexistent confirmation', () => {
    const guard = new PermissionGuard();
    expect(guard.cancelConfirmation('nonexistent')).toBe(false);
  });

  it('cancels all pending confirmations', async () => {
    const guard = new PermissionGuard();
    const tool1 = createTestTool({ id: 't1', risk: 'high' });
    const tool2 = createTestTool({ id: 't2', risk: 'critical' });

    await guard.executeWithPendingConfirmation(tool1, {});
    await guard.executeWithPendingConfirmation(tool2, {});
    expect(guard.getPendingConfirmations()).toHaveLength(2);

    const count = guard.cancelAllPending();
    expect(count).toBe(2);
    expect(guard.getPendingConfirmations()).toHaveLength(0);
  });

  it('logs audit entries for confirmed pending execution', async () => {
    const guard = new PermissionGuard();
    const tool = createTestTool({ risk: 'high' });

    const pending = await guard.executeWithPendingConfirmation(tool, {});
    await pending.confirm();

    const entries = guard.getAuditLog().getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].result).toBe('success');
    expect(entries[0].confirmedByUser).toBe(true);
  });

  it('logs audit entries for denied pending execution', async () => {
    const guard = new PermissionGuard();
    const tool = createTestTool({ risk: 'high' });

    const pending = await guard.executeWithPendingConfirmation(tool, {});
    await pending.deny();

    const entries = guard.getAuditLog().getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].result).toBe('cancelled');
    expect(entries[0].confirmedByUser).toBe(false);
  });
});

describe('PermissionGuard.updateConfig', () => {
  it('shallow merges partial config with existing', () => {
    const guard = new PermissionGuard();

    // Default: low risk is auto, medium is notify
    expect(guard.checkPermission(createTestTool({ risk: 'low' })).allowed).toBe(true);

    guard.updateConfig({
      defaultPolicy: {
        low: 'confirm',
        medium: 'confirm',
        high: 'confirm',
        critical: 'deny',
      },
    });

    // After update, low risk should require confirmation
    const result = guard.checkPermission(createTestTool({ risk: 'low' }));
    expect(result.requiresConfirmation).toBe(true);
  });

  it('empty partial does not change config', () => {
    const guard = new PermissionGuard();

    const before = guard.checkPermission(createTestTool({ risk: 'low' }));
    guard.updateConfig({});
    const after = guard.checkPermission(createTestTool({ risk: 'low' }));

    expect(after).toEqual(before);
  });

  it('replaces nested objects entirely, does not deep merge', () => {
    const guard = new PermissionGuard();

    // Set app permissions
    guard.setAppPermissions('app-a', {
      appId: 'app-a',
      read: true,
      write: true,
      delete: true,
      bulkWrite: false,
      execute: false,
    });

    // Verify app-a permissions are set
    const toolA = createTestTool({ appId: 'app-a', risk: 'medium' });
    expect(guard.checkPermission(toolA).requiresConfirmation).toBe(false);

    // updateConfig with new defaultPolicy should NOT preserve appPermissions
    // because shallow merge replaces the entire defaultPolicy object
    guard.updateConfig({
      defaultPolicy: {
        low: 'auto',
        medium: 'notify',
        high: 'confirm',
        critical: 'confirm',
      },
    });

    // appPermissions should still be there since we only replaced defaultPolicy
    const toolAAfter = createTestTool({ appId: 'app-a', risk: 'medium' });
    expect(guard.checkPermission(toolAAfter).requiresConfirmation).toBe(false);
  });

  it('replaces appPermissions entirely when included in update', () => {
    const guard = new PermissionGuard();

    guard.setAppPermissions('app-a', {
      appId: 'app-a',
      read: true,
      write: true,
      delete: true,
      bulkWrite: false,
      execute: false,
    });

    // Update with new appPermissions that only has app-b
    guard.updateConfig({
      appPermissions: {
        'app-b': {
          appId: 'app-b',
          read: true,
          write: false,
          delete: false,
          bulkWrite: false,
          execute: false,
        },
      },
    });

    // app-a should no longer have custom permissions (falls back to default)
    const toolA = createTestTool({ appId: 'app-a', risk: 'high' });
    expect(guard.checkPermission(toolA).requiresConfirmation).toBe(true); // default: confirm

    // app-b should have its custom permissions
    const toolB = createTestTool({ appId: 'app-b', risk: 'medium' });
    expect(guard.checkPermission(toolB).requiresConfirmation).toBe(true); // write=false => confirm
  });
});
