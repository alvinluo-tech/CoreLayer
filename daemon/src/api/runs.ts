import { Hono } from "hono";
import { getRepositories } from "../db/factory.js";
import { apiError, extractErrorMessage, logError } from "../utils/errors.js";

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

export default runsRoutes;
