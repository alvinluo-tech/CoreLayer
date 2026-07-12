/**
 * Coding Runtime — public API surface (runtime boundary).
 *
 * This is the ONLY module that HTTP routes, scheduler, and other runtimes
 * may import from the coding runtime. Internal implementation details
 * (adapters/, events/) are not exposed.
 *
 * Boundary rule: http/routes/* → public-api.ts → adapters/events/*
 */

export {
  getCodingRuntime,
  listCodingRuntimes,
  createCodingRun,
  collectCodingArtifacts,
  getExecutorAdapter,
  registerCodingRuntime,
  selectExecutorAdapter,
} from "./registry.js";

export {
  isCommandAvailable,
  getExecutablePath,
  spawnProcess,
} from "./process-spawner.js";
