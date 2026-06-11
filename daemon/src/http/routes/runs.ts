import { Hono } from "hono";
import { getRepositories } from "../../persistence/factory.js";
import { apiError } from "../../shared/errors.js";
import { cancelRun, retryRun } from "../../workflow/run-dispatcher.js";
import { withErrorHandling } from "../middleware/error-handler.js";

const runsRoutes = new Hono();

runsRoutes.get(
  "/",
  withErrorHandling("runs/list", async (c) => {
    const { agentRuns } = getRepositories();
    const limitParam = c.req.query("limit");
    const limit = limitParam ? Number(limitParam) : 50;
    const runs = await agentRuns.getRecent(limit);
    return c.json({ data: runs });
  }),
);

runsRoutes.get(
  "/:id",
  withErrorHandling("runs/get", async (c) => {
    const { agentRuns } = getRepositories();
    const id = c.req.param("id")!;
    const run = await agentRuns.getById(id);
    if (!run) {
      return apiError(c, "Run not found", 404);
    }
    return c.json({ data: run });
  }),
);

runsRoutes.get(
  "/:id/events",
  withErrorHandling("runs/events", async (c) => {
    const { agentRunEvents } = getRepositories();
    const id = c.req.param("id")!;
    const events = await agentRunEvents.getByRunId(id);
    return c.json({ data: events });
  }),
);

runsRoutes.get(
  "/:id/artifacts",
  withErrorHandling("runs/artifacts", async (c) => {
    const { agentRuns } = getRepositories();
    const id = c.req.param("id")!;
    const run = await agentRuns.getById(id);
    if (!run) {
      return apiError(c, "Run not found", 404);
    }
    return c.json({ data: run.artifacts ?? [] });
  }),
);

runsRoutes.post(
  "/:id/cancel",
  withErrorHandling("runs/cancel", async (c) => {
    const id = c.req.param("id")!;
    const success = await cancelRun(id);
    if (!success) {
      return apiError(c, "Run not found or already completed", 400);
    }
    return c.json({ data: { cancelled: true } });
  }),
);

runsRoutes.post(
  "/:id/retry",
  withErrorHandling("runs/retry", async (c) => {
    const id = c.req.param("id")!;
    const success = await retryRun(id);
    if (!success) {
      return apiError(c, "Run not found or not in failed state", 400);
    }
    return c.json({ data: { retried: true } });
  }),
);

export default runsRoutes;
