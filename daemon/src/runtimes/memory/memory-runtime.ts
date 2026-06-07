/**
 * Memory Runtime — manages memory storage, retrieval, and temporal reasoning.
 *
 * This is a minimal ManagedRuntime facade that exposes memory capabilities
 * through the RuntimeProtocol HTTP endpoints.
 */

import type {
  ManagedRuntime,
  CreateManagedRuntimeInput,
} from "@jarvis/runtime-core";
import type {
  RuntimeInfo,
  RuntimeStatus,
  RuntimeCapabilitiesResponse,
  RuntimeEvent,
  StartRunRequest,
  StartRunResponse,
  CancelRunRequest,
  CancelRunResponse,
  RuntimeHealth,
} from "@jarvis/runtime-protocol";

export interface MemoryRuntimeConfig extends CreateManagedRuntimeInput {
  maxMemories?: number;
}

/**
 * Memory Runtime implementation.
 */
export class MemoryRuntime implements ManagedRuntime {
  private info: RuntimeInfo;
  private health: RuntimeHealth = "unknown";
  private startedAt: string | null = null;
  private eventListeners: Set<(event: RuntimeEvent) => void> = new Set();

  constructor(config: MemoryRuntimeConfig) {
    this.info = {
      id: config.id,
      kind: "memory",
      version: config.version,
      protocolVersion: 1,
      health: "unknown",
      port: config.port,
      appDataPath: config.appDataPath,
      logPath: config.logPath,
      restartCount: 0,
    };
  }

  getInfo(): RuntimeInfo {
    return { ...this.info };
  }

  async getStatus(): Promise<RuntimeStatus> {
    const uptime = this.startedAt
      ? Date.now() - new Date(this.startedAt).getTime()
      : 0;

    return {
      ...this.info,
      health: this.health,
      activeRun: false,
      completedRuns: 0,
      failedRuns: 0,
      uptime,
    };
  }

  getCapabilities(): RuntimeCapabilitiesResponse {
    return {
      capabilities: [
        "memory:store",
        "memory:retrieve",
        "memory:search",
        "memory:temporal",
        "memory:prune",
      ],
      supportedEvents: [
        "memory:stored",
        "memory:retrieved",
        "memory:pruned",
      ],
      maxConcurrentRuns: 1,
    };
  }

  async startRun(request: StartRunRequest): Promise<StartRunResponse> {
    return { runId: request.runId, status: "started" };
  }

  async cancelRun(request: CancelRunRequest): Promise<CancelRunResponse> {
    return { runId: request.runId, status: "not_found" };
  }

  async *subscribeToEvents(): AsyncIterable<RuntimeEvent> {
    const queue: RuntimeEvent[] = [];
    let resolve: (() => void) | null = null;

    const listener = (event: RuntimeEvent) => {
      queue.push(event);
      resolve?.();
    };

    this.eventListeners.add(listener);

    try {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          await new Promise<void>((r) => {
            resolve = r;
          });
        }
      }
    } finally {
      this.eventListeners.delete(listener);
    }
  }

  async shutdown(): Promise<void> {
    this.health = "unhealthy";
    this.info.health = "unhealthy";
  }

  async healthCheck(): Promise<boolean> {
    try {
      this.health = "healthy";
      this.info.health = "healthy";
      this.info.lastHealthCheck = new Date().toISOString();
      return true;
    } catch {
      this.health = "unhealthy";
      this.info.health = "unhealthy";
      return false;
    }
  }

  async start(): Promise<void> {
    this.startedAt = new Date().toISOString();
    this.info.startedAt = this.startedAt;
    await this.healthCheck();

    this.emitEvent({
      type: "runtime:started",
      payload: {
        runtimeId: this.info.id,
        kind: "memory",
        timestamp: new Date().toISOString(),
      },
    });
  }

  private emitEvent(event: RuntimeEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }
}

export function createMemoryRuntime(config: MemoryRuntimeConfig): MemoryRuntime {
  return new MemoryRuntime(config);
}
