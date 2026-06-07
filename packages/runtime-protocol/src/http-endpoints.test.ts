import { describe, it, expect } from 'vitest';
import type {
  HealthResponse,
  RuntimeStatusResponse,
  RuntimeCapabilitiesResponse,
  StartRunResponse,
  CancelRunResponse,
  ShutdownResponse,
} from './http-endpoints.js';
import { RUNTIME_PROTOCOL_VERSION, RUNTIME_ENDPOINTS } from './http-endpoints.js';

describe('http-endpoints types', () => {
  it('HealthResponse shape', () => {
    const res: HealthResponse = { status: 'ok', timestamp: '', uptime: 0 };
    expect(res.status).toBe('ok');
  });

  it('RuntimeStatusResponse uses RuntimeKind not plain string', () => {
    const res: RuntimeStatusResponse = {
      id: 'test',
      kind: 'agent',
      version: '1.0.0',
      protocolVersion: 1,
      health: 'healthy',
      activeRun: false,
      completedRuns: 0,
      failedRuns: 0,
      uptime: 0,
    };
    expect(res.kind).toBe('agent');
  });

  it('RuntimeCapabilitiesResponse shape', () => {
    const res: RuntimeCapabilitiesResponse = {
      capabilities: [],
      supportedEvents: [],
      maxConcurrentRuns: 1,
    };
    expect(res.capabilities).toEqual([]);
  });

  it('StartRunResponse shape', () => {
    const res: StartRunResponse = { runId: 'r1', status: 'started' };
    expect(res.status).toBe('started');
  });

  it('CancelRunResponse shape', () => {
    const res: CancelRunResponse = { runId: 'r1', status: 'cancelled' };
    expect(res.status).toBe('cancelled');
  });

  it('ShutdownResponse shape', () => {
    const res: ShutdownResponse = { status: 'shutdown_initiated', timestamp: '' };
    expect(res.status).toBe('shutdown_initiated');
  });

  it('RUNTIME_PROTOCOL_VERSION is 1', () => {
    expect(RUNTIME_PROTOCOL_VERSION).toBe(1);
  });

  it('RUNTIME_ENDPOINTS has all standard paths', () => {
    expect(RUNTIME_ENDPOINTS.HEALTH).toBe('/health');
    expect(RUNTIME_ENDPOINTS.STATUS).toBe('/runtime/status');
    expect(RUNTIME_ENDPOINTS.CAPABILITIES).toBe('/runtime/capabilities');
    expect(RUNTIME_ENDPOINTS.START_RUN).toBe('/runtime/start-run');
    expect(RUNTIME_ENDPOINTS.CANCEL_RUN).toBe('/runtime/cancel-run');
    expect(RUNTIME_ENDPOINTS.EVENTS).toBe('/runtime/events');
    expect(RUNTIME_ENDPOINTS.SHUTDOWN).toBe('/runtime/shutdown');
  });
});
