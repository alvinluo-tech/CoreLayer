/**
 * Trajectory routes — export execution trajectory bundles.
 */

import { Hono } from "hono";
import { generateTrajectory } from "../../trajectory/trajectory-service.js";

const trajectoryRoutes = new Hono();

/**
 * GET /api/runs/:runId/trajectory
 *
 * Export a trajectory bundle for a run containing events, logs,
 * approvals, artifacts, and executor metadata with secrets redacted.
 */
trajectoryRoutes.get("/:runId/trajectory", async (c) => {
  const runId = c.req.param("runId");
  if (!runId) {
    return c.json({ error: "runId is required" }, 400);
  }

  try {
    const bundle = await generateTrajectory(runId);
    return c.json(bundle);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate trajectory";
    return c.json({ error: message }, 500);
  }
});

export default trajectoryRoutes;
