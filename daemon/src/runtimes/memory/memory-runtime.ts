/**
 * Memory Runtime — manages memory storage, retrieval, and temporal reasoning.
 *
 * This is a minimal ManagedRuntime facade that exposes memory capabilities
 * through the RuntimeProtocol HTTP endpoints.
 */

import type {
  RuntimeCapabilitiesResponse,
  StartRunRequest,
  StartRunResponse,
  CancelRunRequest,
  CancelRunResponse,
} from "@jarvis/runtime-protocol";
import { BaseRuntime, BaseRuntimeConfig } from "../base-runtime.js";

export interface MemoryRuntimeConfig extends BaseRuntimeConfig {
  maxMemories?: number;
}

/**
 * Memory Runtime implementation.
 */
export class MemoryRuntime extends BaseRuntime {
  constructor(config: MemoryRuntimeConfig) {
    super({ ...config, kind: "memory" });
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

  override async startRun(request: StartRunRequest): Promise<StartRunResponse> {
    return { runId: request.runId, status: "started" };
  }

  override async cancelRun(request: CancelRunRequest): Promise<CancelRunResponse> {
    return { runId: request.runId, status: "not_found" };
  }
}

export function createMemoryRuntime(config: MemoryRuntimeConfig): MemoryRuntime {
  return new MemoryRuntime(config);
}
