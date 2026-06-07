import { describe, it, expect } from 'vitest';
import type { ProcessSupervisor, ProcessInfo, ProcessState } from './process-supervisor.js';

/**
 * Contract test: verifies that a mock implementation satisfies the
 * ProcessSupervisor interface shape.
 */
describe('ProcessSupervisor interface contract', () => {
  function createMockSupervisor(): ProcessSupervisor {
    const processes = new Map<string, ProcessInfo>();
    let counter = 0;

    return {
      async startProcess(kind): Promise<ProcessInfo> {
        counter++;
        const info: ProcessInfo = {
          id: `proc-${counter}`,
          pid: 12345 + counter,
          kind,
          state: 'running',
          startedAt: new Date().toISOString(),
        };
        processes.set(info.id, info);
        return info;
      },
      async stopProcess(processId: string): Promise<void> {
        processes.delete(processId);
      },
      getProcess(processId: string): ProcessInfo | undefined {
        return processes.get(processId);
      },
      getRunningProcesses(): ProcessInfo[] {
        return Array.from(processes.values());
      },
      async restartProcess(processId: string): Promise<ProcessInfo> {
        const existing = processes.get(processId);
        if (!existing) throw new Error(`Process ${processId} not found`);
        const info: ProcessInfo = { ...existing, state: 'running' };
        processes.set(processId, info);
        return info;
      },
      async checkHealth(): Promise<boolean> {
        return true;
      },
      async *subscribeToEvents() {},
    };
  }

  it('startProcess returns ProcessInfo', async () => {
    const supervisor = createMockSupervisor();
    const info = await supervisor.startProcess('agent', { command: 'node' });
    expect(info.id).toMatch(/^proc-/);
    expect(info.pid).toBeGreaterThan(0);
    expect(info.kind).toBe('agent');
    expect(info.state).toBe('running');
  });

  it('getProcess retrieves by id', async () => {
    const supervisor = createMockSupervisor();
    await supervisor.startProcess('agent', { command: 'node' });
    const proc = supervisor.getProcess('proc-1');
    expect(proc).toBeDefined();
    expect(proc?.state).toBe('running');
  });

  it('getProcess returns undefined for missing id', () => {
    const supervisor = createMockSupervisor();
    expect(supervisor.getProcess('nonexistent')).toBeUndefined();
  });

  it('getRunningProcesses returns all', async () => {
    const supervisor = createMockSupervisor();
    await supervisor.startProcess('agent', { command: 'a' });
    await supervisor.startProcess('tool', { command: 'b' });
    expect(supervisor.getRunningProcesses()).toHaveLength(2);
  });

  it('stopProcess removes process', async () => {
    const supervisor = createMockSupervisor();
    const proc = await supervisor.startProcess('agent', { command: 'node' });
    await supervisor.stopProcess(proc.id);
    expect(supervisor.getProcess(proc.id)).toBeUndefined();
  });

  it('ProcessInfo has valid ProcessState', () => {
    const validStates: ProcessState[] = [
      'starting',
      'running',
      'stopping',
      'stopped',
      'failed',
      'crashed',
    ];
    expect(validStates).toHaveLength(6);
  });

  it('subscribeToEvents returns AsyncIterable', async () => {
    const supervisor = createMockSupervisor();
    const events = supervisor.subscribeToEvents();
    expect(typeof events[Symbol.asyncIterator]).toBe('function');
  });
});
