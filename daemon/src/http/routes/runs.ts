import { Hono } from "hono";
import { getRepositories } from "../../persistence/factory.js";
import { apiError } from "../../shared/errors.js";
import { cancelRun, retryRun } from "../../workflow/run-dispatcher.js";
import { withErrorHandling } from "../middleware/error-handler.js";
import { getActiveQueue } from "../../runtimes/agent/public-api.js";
import { generateTrajectory } from "../../trajectory/trajectory-service.js";
import { z } from "zod";

const injectMessageSchema = z.object({
  message: z.string().min(1, "消息不能为空"),
  mode: z.enum(["steer", "followUp", "interrupt"]).default("steer"),
});



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
 * Enqueue a steer, followUp, or interrupt message into a running agent loop.
 *
 * - steer: Injected between tool-call rounds (before next LLM call)
 * - followUp: Queued until the current loop completes, then processed as a new turn
 * - interrupt: Immediately breaks the loop
 */
runsRoutes.post(
  "/:id/message",
  withErrorHandling("runs/message", async (c) => {
    const id = c.req.param("id")!;
    const body = await c.req.json().catch(() => ({}));
    const parsed = injectMessageSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(c, parsed.error.errors[0]?.message || "Validation failed", 400);
    }
    const { message, mode } = parsed.data;

    const queue = getActiveQueue(id);
    if (!queue) {
      return apiError(c, "Run not found or not actively running", 404);
    }

    await queue.enqueue(message, mode);
    return c.json({ data: { enqueued: true, mode } });
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

