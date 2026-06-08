import { Hono } from "hono";
import { getRepositories } from "../../persistence/factory.js";
import { apiError, extractErrorMessage, logError } from "../../shared/errors.js";
import { cancelRun, retryRun } from "../../workflow/run-dispatcher.js";

const runsRoutes = new Hono();

/**
 * GET /api/runs - List recent agent runs
 */
runsRoutes.get("/", async (c) => {
  try {
    const { agentRuns } = getRepositories();
    const limitParam = c.req.query("limit");
    const limit = limitParam ? Number(limitParam) : 50;
    const runs = await agentRuns.getRecent(limit);
    return c.json({ data: runs });
  } catch (err) {
    logError("runs/list", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * GET /api/runs/:id - Get a specific run
 */
runsRoutes.get("/:id", async (c) => {
  try {
    const { agentRuns } = getRepositories();
    const id = c.req.param("id");
    const run = await agentRuns.getById(id);
    if (!run) {
      return apiError(c, "Run not found", 404);
    }
    return c.json({ data: run });
  } catch (err) {
    logError("runs/get", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * GET /api/runs/:id/events - Get events for a specific run
 */
runsRoutes.get("/:id/events", async (c) => {
  try {
    const { agentRunEvents } = getRepositories();
    const id = c.req.param("id");
    const events = await agentRunEvents.getByRunId(id);
    return c.json({ data: events });
  } catch (err) {
    logError("runs/events", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * GET /api/runs/:id/artifacts - Get artifacts for a specific run
 */
runsRoutes.get("/:id/artifacts", async (c) => {
  try {
    const { agentRuns } = getRepositories();
    const id = c.req.param("id");
    const run = await agentRuns.getById(id);
    if (!run) {
      return apiError(c, "Run not found", 404);
    }
    return c.json({ data: run.artifacts ?? [] });
  } catch (err) {
    logError("runs/artifacts", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * POST /api/runs/:id/cancel - Cancel a running or queued run
 */
runsRoutes.post("/:id/cancel", async (c) => {
  try {
    const id = c.req.param("id");
    const success = await cancelRun(id);
    if (!success) {
      return apiError(c, "Run not found or already completed", 400);
    }
    return c.json({ data: { cancelled: true } });
  } catch (err) {
    logError("runs/cancel", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * POST /api/runs/:id/retry - Retry a failed run
 */
runsRoutes.post("/:id/retry", async (c) => {
  try {
    const id = c.req.param("id");
    const success = await retryRun(id);
    if (!success) {
      return apiError(c, "Run not found or not in failed state", 400);
    }
    return c.json({ data: { retried: true } });
  } catch (err) {
    logError("runs/retry", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

export default runsRoutes;
