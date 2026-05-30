import { Hono } from "hono";
import { getRepositories } from "../db/factory.js";
import { apiError, extractErrorMessage, logError } from "../utils/errors.js";

const app = new Hono();

// GET / - Query tasks
app.get("/", async (c) => {
  try {
    const status = c.req.query("status");
    const priority = c.req.query("priority");
    const tasks = await getRepositories().tasks.query({
      status: status ?? undefined,
      priority: priority ? Number(priority) : undefined,
    });
    return c.json({ tasks, count: tasks.length });
  } catch (err) {
    logError("tasks/list", err);
    return apiError(c, extractErrorMessage(err));
  }
});

// POST / - Create task
app.post("/", async (c) => {
  try {
    const body = await c.req.json<{
      title: string;
      priority?: number;
      dueDate?: string;
      tags?: string[];
      description?: string;
    }>();

    if (!body.title?.trim()) {
      return apiError(c, "Title is required", 400);
    }

    const task = await getRepositories().tasks.create({
      title: body.title,
      description: body.description,
      priority: body.priority,
      dueDate: body.dueDate,
      tags: body.tags,
    });

    return c.json({ task }, 201);
  } catch (err) {
    logError("tasks/create", err);
    return apiError(c, extractErrorMessage(err));
  }
});

// PATCH /:id - Update task
app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const body = await c.req.json<{
      title?: string;
      priority?: number;
      status?: string;
      dueDate?: string;
      tags?: string[];
    }>();
    const task = await getRepositories().tasks.update(id, body);
    return c.json({ task });
  } catch (err) {
    logError("tasks/update", err);
    const msg = extractErrorMessage(err);
    // Surface "not found" as 404, everything else as 500
    return apiError(c, msg.toLowerCase().includes("not found") ? "Task not found" : msg,
      msg.toLowerCase().includes("not found") ? 404 : 500);
  }
});

// DELETE /:id - Soft delete task
app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await getRepositories().tasks.delete(id);
    return c.json({ success: true });
  } catch (err) {
    logError("tasks/delete", err);
    return apiError(c, extractErrorMessage(err));
  }
});

export default app;
