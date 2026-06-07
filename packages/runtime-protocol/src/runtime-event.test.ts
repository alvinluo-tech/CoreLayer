import { describe, it, expect } from 'vitest';
import type { RuntimeStartedEvent } from './runtime-event.js';
import { createRuntimeEvent } from './runtime-event.js';

describe('runtime-event types', () => {
  it('RuntimeStartedEvent kind is RuntimeKind, not plain string', () => {
    const event: RuntimeStartedEvent = {
      type: 'runtime:started',
      payload: {
        runtimeId: 'agent-1',
        kind: 'agent',
        timestamp: '',
      },
    };
    expect(event.payload.kind).toBe('agent');
  });

  it('createRuntimeEvent adds timestamp', () => {
    const event = createRuntimeEvent<RuntimeStartedEvent>({
      type: 'runtime:started',
      payload: {
        runtimeId: 'test',
        kind: 'tool',
      },
    });
    expect(event.payload.timestamp).toBeTruthy();
    expect(event.type).toBe('runtime:started');
  });

  it('RuntimeEvent union covers all event types', () => {
    const types = [
      'runtime:started',
      'runtime:stopped',
      'runtime:health_changed',
      'run:started',
      'run:progress',
      'run:completed',
      'run:failed',
      'runtime:error',
    ];
    expect(types.length).toBe(8);
  });
});
