/**
 * Runtime host — registry, lifecycle, and status aggregation.
 *
 * This is the public entry point for runtime-host functionality.
 * API routes and daemon startup import from here.
 */

export {
  registerRuntime,
  getRuntimeInstances,
  getRuntimeInstance,
} from "./registry.js";

export { startAllRuntimes } from "./lifecycle.js";

export { buildRuntimeComponents } from "./status.js";
