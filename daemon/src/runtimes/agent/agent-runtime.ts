/**
 * Agent Runtime — manages AI orchestration, model gateway, and agent runs.
 *
 * This runtime wraps the existing ai/ and orchestrator/ modules,
 * exposing them through the RuntimeProtocol HTTP endpoints.
 */

import type {
  RuntimeCapabilitiesResponse,
  StartRunRequest,
  StartRunResponse,
} from "@jarvis/runtime-protocol";
import { BaseRuntime, BaseRuntimeConfig } from "../base-runtime.js";

export interface AgentRuntimeConfig extends BaseRuntimeConfig {
  /** Max concurrent agent runs */
  maxConcurrentRuns?: number;
  /** Run timeout in ms */
  runTimeoutMs?: number;
}

/**
 * Agent Runtime implementation.
 */
export class AgentRuntime extends BaseRuntime {
  private maxConcurrentRuns: number;
  private runTimeoutMs: number;

  constructor(config: AgentRuntimeConfig) {
    super({ ...config, kind: "agent" });
    this.maxConcurrentRuns = config.maxConcurrentRuns ?? 3;
    this.runTimeoutMs = config.runTimeoutMs ?? 300_000;
  }

  getCapabilities(): RuntimeCapabilitiesResponse {
    return {
      capabilities: [
        "agent:run",
        "agent:stream",
        "agent:cancel",
        "model:select",
        "conversation:create",
        "conversation:compress",
      ],
      supportedEvents: [
        "run:started",
        "run:progress",
        "run:completed",
        "run:failed",
      ],
      maxConcurrentRuns: this.maxConcurrentRuns,
    };
  }

  override async startRun(request: StartRunRequest): Promise<StartRunResponse> {
    if (this.activeRuns.size >= this.maxConcurrentRuns) {
      return {
        runId: request.runId,
        status: "rejected",
        reason: "Max concurrent runs reached",
      };
    }

    const result = await super.startRun(request);

    // Set up timeout
    const timeout = setTimeout(() => {
      if (this.activeRuns.has(request.runId)) {
        const run = this.activeRuns.get(request.runId);
        run?.abortController.abort();
        this.handleRunFailed(request.runId, "Run timed out");
      }
    }, this.runTimeoutMs);

    const run = this.activeRuns.get(request.runId);
    if (run) {
      (run as { timeout?: ReturnType<typeof setTimeout> }).timeout = timeout;
    }

    return result;
  }

  override completeRun(runId: string): void {
    const run = this.activeRuns.get(runId);
    if (!run) return;

    clearTimeout(
      (run as { timeout?: ReturnType<typeof setTimeout> }).timeout,
    );
    super.completeRun(runId);
  }

  override handleRunFailed(runId: string, error: string): void {
    const run = this.activeRuns.get(runId);
    if (run) {
      clearTimeout(
        (run as { timeout?: ReturnType<typeof setTimeout> }).timeout,
      );
    }
    super.handleRunFailed(runId, error);
  }

  /**
   * Create a Hono router with Agent-specific endpoints.
   */
  override createRouter() {
    const app = super.createRouter();
    return app;
  }
}

/**
 * Create a new Agent Runtime.
 */
export function createAgentRuntime(
  config: AgentRuntimeConfig,
): AgentRuntime {
  return new AgentRuntime(config);
}
