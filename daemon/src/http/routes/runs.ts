import { Hono } from "hono";
import { getRepositories } from "../../persistence/factory.js";
import { apiError } from "../../shared/errors.js";
import { cancelRun, retryRun } from "../../workflow/run-dispatcher.js";
import { withErrorHandling } from "../middleware/error-handler.js";
import { generateTrajectory } from "../../trajectory/trajectory-service.js";

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

/**
 * Steer/followUp/interrupt message injection into a hand-written agent loop.
 *
 * The hand-written loop (agent-loop.ts) and its message queue were removed —
 * the Vercel AI SDK core loop in conversation.ts now owns step control via
 * prepareStep. This endpoint is permanently gone: 410.
 */
runsRoutes.post(
  "/:id/message",
  withErrorHandling("runs/message", async (c) => {
    return apiError(
      c,
      "Run message injection was removed with the hand-written agent loop. Use the standard conversation send API instead.",
      410,
    );
  }),
);

runsRoutes.get(
  "/:id/trajectory",
  withErrorHandling("runs/trajectory", async (c) => {
    const id = c.req.param("id")!;
    const bundle = await generateTrajectory(id);
    return c.json(bundle);
  })
);

export default runsRoutes;

