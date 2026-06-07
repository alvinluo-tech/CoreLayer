import type { RuntimeKind, RuntimeHealth } from './runtime-info.js';

/**
 * Standard HTTP endpoints that every managed runtime must implement.
 */

/**
 * GET /health
 */
export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
}

/**
 * GET /runtime/status
 */
export interface RuntimeStatusResponse {
  id: string;
  kind: RuntimeKind;
  version: string;
  protocolVersion: number;
  health: RuntimeHealth;
  activeRun: boolean;
  activeRunId?: string;
  completedRuns: number;
  failedRuns: number;
  uptime: number;
}

/**
 * GET /runtime/capabilities
 */
export interface RuntimeCapabilitiesResponse {
  capabilities: string[];
  supportedEvents: string[];
  maxConcurrentRuns: number;
}

/**
 * POST /runtime/start-run
 */
export interface StartRunRequest {
  runId: string;
  input: unknown;
  options?: Record<string, unknown>;
}

export interface StartRunResponse {
  runId: string;
  status: 'started' | 'queued' | 'rejected';
  reason?: string;
}

/**
 * POST /runtime/cancel-run
 */
export interface CancelRunRequest {
  runId: string;
  reason?: string;
}

export interface CancelRunResponse {
  runId: string;
  status: 'cancelled' | 'not_found' | 'already_completed';
}

/**
 * POST /runtime/shutdown
 */
export interface ShutdownRequest {
  reason?: string;
  timeoutMs?: number;
}

export interface ShutdownResponse {
  status: 'shutdown_initiated' | 'shutdown_complete';
  timestamp: string;
}

/**
 * Runtime protocol version.
 */
export const RUNTIME_PROTOCOL_VERSION = 1;

/**
 * All standard endpoint paths.
 */
export const RUNTIME_ENDPOINTS = {
  HEALTH: '/health',
  STATUS: '/runtime/status',
  CAPABILITIES: '/runtime/capabilities',
  START_RUN: '/runtime/start-run',
  CANCEL_RUN: '/runtime/cancel-run',
  EVENTS: '/runtime/events',
  SHUTDOWN: '/runtime/shutdown',
} as const;
