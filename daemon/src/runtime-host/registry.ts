/**
 * Daemon-side runtime registry.
 *
 * Holds the mapping from RuntimeComponentKind to live ManagedRuntime instances.
 * This is the single source of truth for which runtimes are registered.
 */

import type { ManagedRuntime } from "@jarvis/runtime-core";
import type { RuntimeComponentKind } from "./contract.js";

/**
 * Map of runtime kind → ManagedRuntime instance.
 * Populated by the runtime facade modules and consumed by lifecycle and status.
 */
const runtimeInstances = new Map<RuntimeComponentKind, ManagedRuntime>();

/**
 * Register a runtime instance for a given kind.
 */
export function registerRuntime(kind: RuntimeComponentKind, runtime: ManagedRuntime): void {
  runtimeInstances.set(kind, runtime);
}

/**
 * Get all registered runtime instances.
 */
export function getRuntimeInstances(): Map<RuntimeComponentKind, ManagedRuntime> {
  return runtimeInstances;
}

/**
 * Get a single runtime instance by kind.
 */
export function getRuntimeInstance(kind: RuntimeComponentKind): ManagedRuntime | undefined {
  return runtimeInstances.get(kind);
}
