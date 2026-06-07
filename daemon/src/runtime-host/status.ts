/**
 * Status aggregation for /api/runtime/components.
 *
 * Reads real health status from each registered runtime instance
 * and builds the RuntimeComponent array for the API response.
 */

import type { RuntimeComponent, RuntimeComponentKind } from "./contract.js";
import { ALL_RUNTIME_KINDS } from "./contract.js";
import { getRuntimeInstances } from "./registry.js";
import { resolveAppPaths } from "../config/app-paths.js";

/**
 * Build the list of runtime components with real status from the registry.
 *
 * For runtimes that are registered and started, reads their actual health
 * status. For unregistered runtimes (e.g. tool, coding, memory), reports
 * "pending" — they have not been started.
 */
export async function buildRuntimeComponents(): Promise<RuntimeComponent[]> {
  const instances = getRuntimeInstances();

  const { logDir } = resolveAppPaths();

  return Promise.all(
    ALL_RUNTIME_KINDS.map(async (kind: RuntimeComponentKind) => {
      const runtime = instances.get(kind);
      let status: RuntimeComponent["status"] = "pending";
      let lastError: string | undefined;

      if (runtime) {
        try {
          const runtimeStatus = await runtime.getStatus();
          status =
            runtimeStatus.health === "healthy"
              ? "running"
              : runtimeStatus.health === "degraded"
                ? "degraded"
                : "failed";
          lastError = runtimeStatus.lastError;
        } catch (err) {
          status = "failed";
          lastError = err instanceof Error ? err.message : String(err);
        }
      }

      return {
        kind,
        status,
        pid: runtime ? process.pid : undefined,
        healthUrl: "/health",
        logPath: logDir,
        restartPolicy: { type: "maxAttempts" as const, maxAttempts: 3 },
        lastError,
      };
    })
  );
}
