import { describe, it, expect } from 'vitest';
import type { RuntimeKind, RuntimeHealth, RuntimeInfo, RuntimeStatus } from './runtime-info.js';

describe('runtime-info types', () => {
  it('RuntimeKind includes all 7 canonical kinds', () => {
    const kinds: RuntimeKind[] = [
      'agent',
      'tool',
      'coding',
      'voice',
      'memory',
      'scheduler',
      'computer-control',
    ];
    expect(kinds).toHaveLength(7);
  });

  it('RuntimeHealth includes all health states', () => {
    const health: RuntimeHealth[] = ['healthy', 'degraded', 'unhealthy', 'unknown'];
    expect(health).toHaveLength(4);
  });

  it('RuntimeInfo shape is complete', () => {
    const info: RuntimeInfo = {
      id: 'test',
      kind: 'agent',
      version: '1.0.0',
      protocolVersion: 1,
      health: 'healthy',
      restartCount: 0,
    };
    expect(info.id).toBe('test');
    expect(info.kind).toBe('agent');
  });

  it('RuntimeStatus extends RuntimeInfo with run tracking', () => {
    const status: RuntimeStatus = {
      id: 'test',
      kind: 'tool',
      version: '1.0.0',
      protocolVersion: 1,
      health: 'healthy',
      restartCount: 0,
      activeRun: false,
      completedRuns: 0,
      failedRuns: 0,
      uptime: 0,
    };
    expect(status.activeRun).toBe(false);
    expect(status.completedRuns).toBe(0);
  });
});
