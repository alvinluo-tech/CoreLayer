import { invoke } from '@tauri-apps/api/core';

export async function getDaemonUrl(): Promise<string> {
  return invoke('get_daemon_url_command');
}

export async function getHealth(): Promise<{
  status: string;
  timestamp: string;
  storageMode: string;
  aiProvider: string;
  aiModel: string;
}> {
  return invoke('health_check');
}

export interface RegisteredRuntime {
  kind: string;
  status: string;
  lastError?: string;
}

export interface DaemonStatus {
  running: boolean;
  healthy: boolean;
  url: string;
  restartAttempts: number;
  lastHealthCheck: string | null;
  lastError: string | null;
  pid: number | null;
  port: number | null;
  logPath: string | null;
  runtimeMode: string;
  appDataDir?: string;
  registeredRuntimes?: RegisteredRuntime[];
}

export async function getDaemonStatus(): Promise<DaemonStatus> {
  return invoke('daemon_status');
}

export async function restartDaemon(): Promise<DaemonStatus> {
  return invoke('restart_daemon');
}

export type RuntimeKind =
  | 'agent'
  | 'tool'
  | 'coding'
  | 'voice'
  | 'memory'
  | 'scheduler'
  | 'computer-control';

export type RuntimeStatus = 'pending' | 'starting' | 'running' | 'degraded' | 'stopped' | 'failed';

export type RestartPolicy = 'never' | { maxAttempts: number } | 'always';

export interface RuntimeComponent {
  kind: RuntimeKind;
  status: RuntimeStatus;
  pid: number | null;
  port: number | null;
  healthUrl: string | null;
  logPath: string | null;
  restartPolicy: RestartPolicy;
  lastHealthCheck: string | null;
  lastError: string | null;
}

export async function getRuntimeComponents(): Promise<RuntimeComponent[]> {
  return invoke('get_runtime_components');
}
