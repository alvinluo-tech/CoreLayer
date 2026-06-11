/**
 * Coding Runtime — manages coding agent adapters (Claude Code, Codex).
 *
 * This runtime wraps the existing coding runtime modules,
 * exposing them through the RuntimeProtocol HTTP endpoints.
 */

import type {
  RuntimeCapabilitiesResponse,
  StartRunRequest,
  StartRunResponse,
} from "@jarvis/runtime-protocol";
import { BaseRuntime, BaseRuntimeConfig } from "../base-runtime.js";

export interface CodingRuntimeConfig extends BaseRuntimeConfig {
  /** Max concurrent coding runs */
  maxConcurrentRuns?: number;
  /** Default run timeout in ms */
  defaultTimeoutMs?: number;
}

/**
 * Coding Runtime implementation.
 */
export class CodingRuntime extends BaseRuntime {
  private maxConcurrentRuns: number;

  constructor(config: CodingRuntimeConfig) {
    super({ ...config, kind: "coding" });
    this.maxConcurrentRuns = config.maxConcurrentRuns ?? 3;
  }

  getCapabilities(): RuntimeCapabilitiesResponse {
    return {
      capabilities: [
        "coding:create_run",
        "coding:cancel_run",
        "coding:stream_events",
        "coding:collect_artifacts",
        "coding:list_adapters",
      ],
      supportedEvents: [
        "run:started",
        "run:progress",
        "run:completed",
        "run:failed",
        "coding:output",
        "coding:artifact",
      ],
      maxConcurrentRuns: this.maxConcurrentRuns,
    };
  }

  override async startRun(request: StartRunRequest): Promise<StartRunResponse> {
    if (this.activeRuns.size >= this.maxConcurrentRuns) {
      return {
        runId: request.runId,
        status: "rejected",
        reason: "Max concurrent coding runs reached",
      };
    }

    return super.startRun(request);
  }

  /**
   * Create a coding run using the existing registry.
   */
  async createCodingRun(
    adapterId: string,
    task: {
      repoPath: string;
      taskPrompt: string;
      branchName?: string;
      timeoutMs?: number;
    },
  ): Promise<{ runId: string; status: string }> {
    const { createCodingRun } = await import("./registry.js");
    const result = await createCodingRun(adapterId, task);
    return { runId: result.runId, status: result.status };
  }

  /**
   * List available coding adapters with their availability status.
   */
  async listAdapters(): Promise<Array<{ id: string; name: string; available: boolean }>> {
    const { listCodingRuntimes, getCodingRuntime } = await import("./registry.js");
    const basics = listCodingRuntimes();
    const results = await Promise.all(
      basics.map(async (b) => {
        const adapter = getCodingRuntime(b.id);
        const availability = adapter ? await adapter.discover() : { available: false };
        return { id: b.id, name: b.name, available: availability.available };
      }),
    );
    return results;
  }

  /**
   * Collect artifacts from a coding run.
   */
  async collectArtifacts(
    adapterId: string,
    runId: string,
  ): Promise<Array<{ type: string; content: string }>> {
    const { collectCodingArtifacts } = await import("./registry.js");
    const artifacts = await collectCodingArtifacts(adapterId, runId);
    return artifacts.map((a) => ({ type: a.type, content: a.content }));
  }

  override createRouter() {
    const app = super.createRouter();

    app.post("/coding/start", async (c) => {
      const body = await c.req.json<{
        adapterId: string;
        task: {
          repoPath: string;
          taskPrompt: string;
          branchName?: string;
          timeoutMs?: number;
        };
      }>();
      const result = await this.createCodingRun(body.adapterId, body.task);
      return c.json(result);
    });

    app.get("/coding/adapters", async (c) => {
      const adapters = await this.listAdapters();
      return c.json({ adapters });
    });

    app.get("/coding/:adapterId/:runId/artifacts", async (c) => {
      const adapterId = c.req.param("adapterId");
      const runId = c.req.param("runId");
      const artifacts = await this.collectArtifacts(adapterId, runId);
      return c.json({ artifacts });
    });

    return app;
  }
}

/**
 * Create a new Coding Runtime.
 */
export function createCodingRuntime(
  config: CodingRuntimeConfig,
): CodingRuntime {
  return new CodingRuntime(config);
}
