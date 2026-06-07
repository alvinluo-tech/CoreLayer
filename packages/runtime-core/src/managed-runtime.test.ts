import { describe, it, expect } from 'vitest';
import type { ManagedRuntime } from './managed-runtime.js';
import type {
  RuntimeInfo,
  RuntimeStatus,
  RuntimeCapabilitiesResponse,
  StartRunResponse,
  CancelRunResponse,
} from '@jarvis/runtime-protocol';

/**
 * Contract test: verifies that a mock implementation satisfies the
 * ManagedRuntime interface. If the interface changes, this test will
 * fail at compile time (via the type annotation) or at runtime (via
 * the assertions).
 */
describe('ManagedRuntime interface contract', () => {
  function createMockRuntime(): ManagedRuntime {
    return {
      getInfo(): RuntimeInfo {
        return {
          id: 'mock',
          kind: 'agent',
          version: '1.0.0',
          protocolVersion: 1,
          health: 'healthy',
          restartCount: 0,
        };
      },
      async start() {},
      async getStatus(): Promise<RuntimeStatus> {
        return {
          id: 'mock',
          kind: 'agent',
          version: '1.0.0',
          protocolVersion: 1,
          health: 'healthy',
          restartCount: 0,
          activeRun: false,
          completedRuns: 0,
          failedRuns: 0,
          uptime: 0,
        };
      },
      getCapabilities(): RuntimeCapabilitiesResponse {
        return {
          capabilities: ['agent:run'],
          supportedEvents: ['run:started'],
          maxConcurrentRuns: 3,
        };
      },
      async startRun(): Promise<StartRunResponse> {
        return { runId: 'r1', status: 'started' };
      },
      async cancelRun(): Promise<CancelRunResponse> {
        return { runId: 'r1', status: 'cancelled' };
      },
      async *subscribeToEvents() {},
      async shutdown() {},
      async healthCheck(): Promise<boolean> {
        return true;
      },
    };
  }

  it('getInfo returns RuntimeInfo', () => {
    const runtime = createMockRuntime();
    const info = runtime.getInfo();
    expect(info.id).toBe('mock');
    expect(info.kind).toBe('agent');
    expect(info.version).toBe('1.0.0');
    expect(info.protocolVersion).toBe(1);
    expect(info.health).toBe('healthy');
    expect(info.restartCount).toBe(0);
  });

  it('start completes without error', async () => {
    const runtime = createMockRuntime();
    await expect(runtime.start()).resolves.toBeUndefined();
  });

  it('getStatus returns RuntimeStatus with run tracking', async () => {
    const runtime = createMockRuntime();
    const status = await runtime.getStatus();
    expect(status.activeRun).toBe(false);
    expect(status.completedRuns).toBe(0);
    expect(status.failedRuns).toBe(0);
    expect(status.uptime).toBe(0);
  });

  it('getCapabilities returns RuntimeCapabilitiesResponse', () => {
    const runtime = createMockRuntime();
    const caps = runtime.getCapabilities();
    expect(caps.capabilities).toContain('agent:run');
    expect(caps.maxConcurrentRuns).toBe(3);
  });

  it('startRun returns StartRunResponse', async () => {
    const runtime = createMockRuntime();
    const res = await runtime.startRun({ runId: 'r1', input: {} });
    expect(res.status).toBe('started');
  });

  it('cancelRun returns CancelRunResponse', async () => {
    const runtime = createMockRuntime();
    const res = await runtime.cancelRun({ runId: 'r1' });
    expect(res.status).toBe('cancelled');
  });

  it('healthCheck returns boolean', async () => {
    const runtime = createMockRuntime();
    const healthy = await runtime.healthCheck();
    expect(healthy).toBe(true);
  });

  it('subscribeToEvents returns AsyncIterable', async () => {
    const runtime = createMockRuntime();
    const events = runtime.subscribeToEvents();
    expect(typeof events[Symbol.asyncIterator]).toBe('function');
  });
});
