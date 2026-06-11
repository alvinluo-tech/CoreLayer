import { Hono } from "hono";
import { getRepositories } from "../../persistence/factory.js";
import { apiError, extractErrorMessage, logError } from "../../shared/errors.js";
import { triggerTask, computeNextRun } from "../../runtimes/scheduler/public-api.js";
import { parseNlTimeToCron } from "../../shared/time/parse-nl-time.js";
import { withErrorHandling } from "../middleware/error-handler.js";

const app = new Hono();

app.get(
  "/",
  withErrorHandling("scheduled-tasks/list", async (c) => {
    const tasks = await getRepositories().scheduledTasks.getAll();
    return c.json({ tasks, count: tasks.length });
  }),
);

app.post(
  "/",
  withErrorHandling("scheduled-tasks/create", async (c) => {
    const body = await c.req.json<{
      name: string;
      cronExpr: string;
      prompt?: string;
      skillName?: string;
      input?: Record<string, unknown>;
      enabled?: boolean;
    }>();

    if (!body.name?.trim()) {
      return apiError(c, "Name is required", 400);
    }
    if (!body.cronExpr?.trim()) {
      return apiError(c, "cronExpr is required", 400);
    }
    if (!body.prompt && !body.skillName) {
      return apiError(c, "Either prompt or skillName must be provided", 400);
    }

    let cronExpr = body.cronExpr.trim();
    if (!/^[0-9*/]/.test(cronExpr)) {
      const parsed = parseNlTimeToCron(cronExpr);
      if (parsed) {
        cronExpr = parsed;
      }
    }

    let nextRun: string;
    try {
      nextRun = computeNextRun(cronExpr);
    } catch {
      return apiError(c, "Invalid cron expression", 400);
    }

    const task = await getRepositories().scheduledTasks.upsert({
      name: body.name,
      cronExpr,
      prompt: body.prompt,
      skillName: body.skillName,
      input: body.input,
      enabled: body.enabled ?? true,
    });

    await getRepositories().scheduledTasks.updateLastRun(task.id, task.lastRun ?? "", nextRun);

    return c.json({ task }, 201);
  }),
);

app.put("/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const body = await c.req.json<{
      name?: string;
      cronExpr?: string;
      prompt?: string;
      skillName?: string;
      input?: Record<string, unknown>;
      enabled?: boolean;
    }>();

    let cronExpr = body.cronExpr;
    if (cronExpr) {
      if (!/^[0-9*/]/.test(cronExpr)) {
        const parsed = parseNlTimeToCron(cronExpr);
        if (parsed) cronExpr = parsed;
      }
      try {
        computeNextRun(cronExpr);
      } catch {
        return apiError(c, "Invalid cron expression", 400);
      }
    }

    const task = await getRepositories().scheduledTasks.update(id, { ...body, cronExpr });
    return c.json({ task });
  } catch (err) {
    logError("scheduled-tasks/update", err);
    const msg = extractErrorMessage(err);
    return apiError(
      c,
      msg.toLowerCase().includes("not found") ? "Scheduled task not found" : msg,
      msg.toLowerCase().includes("not found") ? 404 : 500,
    );
  }
});

app.delete(
  "/:id",
  withErrorHandling("scheduled-tasks/delete", async (c) => {
    const id = c.req.param("id")!;
    const deleted = await getRepositories().scheduledTasks.delete(id);
    if (!deleted) {
      return apiError(c, "Scheduled task not found", 404);
    }
    return c.json({ success: true });
  }),
);

app.post(
  "/:id/trigger",
  withErrorHandling("scheduled-tasks/trigger", async (c) => {
    const id = c.req.param("id")!;
    const result = await triggerTask(id);
    if (!result) {
      return apiError(c, "Scheduled task not found", 404);
    }
    return c.json({ result });
  }),
);

export default app;
