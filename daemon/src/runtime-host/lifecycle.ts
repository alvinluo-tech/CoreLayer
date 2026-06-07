/**
 * Runtime startup/shutdown lifecycle orchestration.
 *
 * start() only initializes runtime lifecycle/status (timestamp, health check,
 * runtime:started event). It must NOT start autonomous scheduler/tick loops
 * or execute side-effect tasks.
 */

import { getRuntimeInstances } from "./registry.js";

/**
 * Start all registered runtime instances.
 */
export async function startAllRuntimes(): Promise<void> {
  for (const [kind, runtime] of getRuntimeInstances()) {
    try {
      await runtime.start();
      console.log(`[Jarvis] Runtime "${kind}" started`);
    } catch (error) {
      console.error(`[Jarvis] Runtime "${kind}" failed to start:`, error);
    }
  }
}
