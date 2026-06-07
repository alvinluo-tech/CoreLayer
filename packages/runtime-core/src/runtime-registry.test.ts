import { describe, it, expect } from 'vitest';
import { InMemoryRuntimeRegistry } from './runtime-registry.js';
import type { ManagedRuntime } from './managed-runtime.js';
import type {
  RuntimeInfo,
  RuntimeStatus,
  RuntimeCapabilitiesResponse,
  StartRunResponse,
  CancelRunResponse,
} from '@jarvis/runtime-protocol';

function createMockRuntime(overrides: Partial<RuntimeInfo> = {}): ManagedRuntime {
  const info: RuntimeInfo = {
    id: 'test-runtime',
    kind: 'agent',
    version: '1.0.0',
    protocolVersion: 1,
    health: 'healthy',
    restartCount: 0,
    ...overrides,
  };

  return {
    getInfo: () => info,
    start: async () => {},
    getStatus: async () =>
      ({
        ...info,
        activeRun: false,
        completedRuns: 0,
        failedRuns: 0,
        uptime: 0,
      }) as RuntimeStatus,
    getCapabilities: () =>
      ({
        capabilities: [],
        supportedEvents: [],
        maxConcurrentRuns: 1,
      }) as RuntimeCapabilitiesResponse,
    startRun: async () => ({ runId: 'r1', status: 'started' }) as StartRunResponse,
    cancelRun: async () => ({ runId: 'r1', status: 'cancelled' }) as CancelRunResponse,
    subscribeToEvents: async function* () {},
    shutdown: async () => {},
    healthCheck: async () => true,
  };
}

describe('InMemoryRuntimeRegistry', () => {
  it('registers and retrieves a runtime', () => {
    const registry = new InMemoryRuntimeRegistry();
    const runtime = createMockRuntime({ id: 'agent-1' });

    registry.register(runtime);

    expect(registry.has('agent-1')).toBe(true);
    expect(registry.get('agent-1')).toBe(runtime);
  });

  it('returns undefined for missing runtime', () => {
    const registry = new InMemoryRuntimeRegistry();
    expect(registry.get('nonexistent')).toBeUndefined();
    expect(registry.has('nonexistent')).toBe(false);
  });

  it('unregisters a runtime', () => {
    const registry = new InMemoryRuntimeRegistry();
    const runtime = createMockRuntime({ id: 'agent-1' });

    registry.register(runtime);
    expect(registry.has('agent-1')).toBe(true);

    registry.unregister('agent-1');
    expect(registry.has('agent-1')).toBe(false);
  });

  it('getAll returns all registered runtimes', () => {
    const registry = new InMemoryRuntimeRegistry();
    const r1 = createMockRuntime({ id: 'agent-1', kind: 'agent' });
    const r2 = createMockRuntime({ id: 'tool-1', kind: 'tool' });

    registry.register(r1);
    registry.register(r2);

    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all).toContain(r1);
    expect(all).toContain(r2);
  });

  it('getByKind filters runtimes by kind', () => {
    const registry = new InMemoryRuntimeRegistry();
    const r1 = createMockRuntime({ id: 'agent-1', kind: 'agent' });
    const r2 = createMockRuntime({ id: 'agent-2', kind: 'agent' });
    const r3 = createMockRuntime({ id: 'tool-1', kind: 'tool' });

    registry.register(r1);
    registry.register(r2);
    registry.register(r3);

    const agents = registry.getByKind('agent');
    expect(agents).toHaveLength(2);
    expect(agents).toContain(r1);
    expect(agents).toContain(r2);
  });

  it('count returns number of registered runtimes', () => {
    const registry = new InMemoryRuntimeRegistry();
    expect(registry.count()).toBe(0);

    registry.register(createMockRuntime({ id: 'a' }));
    expect(registry.count()).toBe(1);

    registry.register(createMockRuntime({ id: 'b' }));
    expect(registry.count()).toBe(2);

    registry.unregister('a');
    expect(registry.count()).toBe(1);
  });

  it('overwrites runtime with same id on re-register', () => {
    const registry = new InMemoryRuntimeRegistry();
    const r1 = createMockRuntime({ id: 'agent-1', version: '1.0.0' });
    const r2 = createMockRuntime({ id: 'agent-1', version: '2.0.0' });

    registry.register(r1);
    registry.register(r2);

    expect(registry.count()).toBe(1);
    expect(registry.get('agent-1')).toBe(r2);
  });
});
