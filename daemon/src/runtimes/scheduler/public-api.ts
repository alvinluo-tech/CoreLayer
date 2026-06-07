/**
 * Scheduler Runtime — public API surface (runtime boundary).
 *
 * This is the ONLY module that HTTP routes may import from the scheduler
 * runtime. Internal implementation details (sensors/, reports/) are not
 * exposed.
 *
 * Boundary rule: http/routes/* → public-api.ts → internal/*
 *
 * Future: will evolve into a command facade / protocol client when runtimes
 * move to separate processes.
 */

export { triggerTask, computeNextRun, recordActivity, getIdleMs } from "./scheduler.js";
