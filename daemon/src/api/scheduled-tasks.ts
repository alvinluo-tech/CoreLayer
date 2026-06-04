import { Hono } from "hono";
import { getRepositories } from "../db/factory.js";
import { apiError, extractErrorMessage, logError } from "../utils/errors.js";
import { triggerTask, computeNextRun } from "../scheduler.js";

const app = new Hono();

// GET / - List all scheduled tasks
app.get("/", async (c) => {
  try {
    const tasks = await getRepositories().scheduledTasks.getAll();
    return c.json({ tasks, count: tasks.length });
  } catch (err) {
    logError("scheduled-tasks/list", err);
    return apiError(c, extractErrorMessage(err));
  }
});

// POST / - Create scheduled task
app.post("/", async (c) => {
  try {
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

    // Validate cron expression by computing next run
    let nextRun: string;
    try {
      nextRun = computeNextRun(body.cronExpr);
    } catch {
      return apiError(c, "Invalid cron expression", 400);
    }

    const task = await getRepositories().scheduledTasks.upsert({
      name: body.name,
      cronExpr: body.cronExpr,
      prompt: body.prompt,
      skillName: body.skillName,
      input: body.input,
      enabled: body.enabled ?? true,
    });

    // Update nextRun in DB
    await getRepositories().scheduledTasks.updateLastRun(task.id, task.lastRun ?? "", nextRun);

    return c.json({ task }, 201);
  } catch (err) {
    logError("scheduled-tasks/create", err);
    return apiError(c, extractErrorMessage(err));
  }
});

// PUT /:id - Update scheduled task
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

    // Validate cron if provided
    if (body.cronExpr) {
      try {
        computeNextRun(body.cronExpr);
      } catch {
        return apiError(c, "Invalid cron expression", 400);
      }
    }

    const task = await getRepositories().scheduledTasks.update(id, body);
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

// DELETE /:id - Delete scheduled task
app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const deleted = await getRepositories().scheduledTasks.delete(id);
    if (!deleted) {
      return apiError(c, "Scheduled task not found", 404);
    }
    return c.json({ success: true });
  } catch (err) {
    logError("scheduled-tasks/delete", err);
    return apiError(c, extractErrorMessage(err));
  }
});

// POST /:id/trigger - Manual trigger
app.post("/:id/trigger", async (c) => {
  const id = c.req.param("id");
  try {
    const result = await triggerTask(id);
    if (!result) {
      return apiError(c, "Scheduled task not found", 404);
    }
    return c.json({ result });
  } catch (err) {
    logError("scheduled-tasks/trigger", err);
    return apiError(c, extractErrorMessage(err));
  }
});

export default app;
