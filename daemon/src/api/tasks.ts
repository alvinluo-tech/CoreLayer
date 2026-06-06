import { Hono } from "hono";
import { getRepositories } from "../db/factory.js";
import { apiError, extractErrorMessage, logError } from "../utils/errors.js";
import { TaskGraph } from "../task/task-graph.js";
import { decomposeTask } from "../task/task-decomposer.js";

const app = new Hono();
const taskGraph = new TaskGraph();

// GET / - Query tasks
app.get("/", async (c) => {
  try {
    const status = c.req.query("status");
    const priority = c.req.query("priority");
    const projectId = c.req.query("projectId");
    const tasks = await getRepositories().tasks.query({
      status: status ?? undefined,
      priority: priority ? Number(priority) : undefined,
      projectId: projectId ?? undefined,
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
      objective?: string;
      assignedAgentId?: string;
      parentTaskId?: string;
      dependencies?: string[];
      acceptanceCriteria?: string[];
      rollbackPlan?: string;
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
      objective: body.objective,
      assignedAgentId: body.assignedAgentId,
      parentTaskId: body.parentTaskId,
      dependencies: body.dependencies,
      acceptanceCriteria: body.acceptanceCriteria,
      rollbackPlan: body.rollbackPlan,
    });

    return c.json({ task }, 201);
  } catch (err) {
    logError("tasks/create", err);
    return apiError(c, extractErrorMessage(err));
  }
});

// GET /:id - Get task by ID
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const task = await getRepositories().tasks.getById(id);
    if (!task) return apiError(c, "Task not found", 404);
    return c.json({ task });
  } catch (err) {
    logError("tasks/get", err);
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
      objective?: string;
      assignedAgentId?: string;
      parentTaskId?: string;
      dependencies?: string[];
      blockedBy?: string[];
      acceptanceCriteria?: string[];
      artifacts?: unknown[];
      runHistory?: unknown[];
      manualInterventionRequired?: boolean;
      rollbackPlan?: string;
    }>();
    const task = await getRepositories().tasks.update(id, body);
    return c.json({ task });
  } catch (err) {
    logError("tasks/update", err);
    const msg = extractErrorMessage(err);
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

// GET /project/:projectId - Get tasks by project
app.get("/project/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  try {
    const tasks = await getRepositories().tasks.getByProjectId(projectId);
    return c.json({ tasks, count: tasks.length });
  } catch (err) {
    logError("tasks/byProject", err);
    return apiError(c, extractErrorMessage(err));
  }
});

// POST /:id/dependencies - Set dependencies for a task
app.post("/:id/dependencies", async (c) => {
  const id = c.req.param("id");
  try {
    const body = await c.req.json<{ dependencies: string[] }>();
    await taskGraph.setDependencies(id, body.dependencies);
    const task = await getRepositories().tasks.getById(id);
    return c.json({ task });
  } catch (err) {
    logError("tasks/setDependencies", err);
    const msg = extractErrorMessage(err);
    return apiError(c, msg, msg.includes("depend on itself") ? 400 : 500);
  }
});

// GET /:id/can-execute - Check if a task can execute
app.get("/:id/can-execute", async (c) => {
  const id = c.req.param("id");
  try {
    const canExecute = await taskGraph.canExecute(id);
    return c.json({ canExecute });
  } catch (err) {
    logError("tasks/canExecute", err);
    return apiError(c, extractErrorMessage(err));
  }
});

// POST /:id/complete - Mark task as completed and unblock dependents
app.post("/:id/complete", async (c) => {
  const id = c.req.param("id");
  try {
    await taskGraph.completeTask(id);
    const task = await getRepositories().tasks.getById(id);
    return c.json({ task });
  } catch (err) {
    logError("tasks/complete", err);
    return apiError(c, extractErrorMessage(err));
  }
});

// GET /project/:projectId/executable - Get executable tasks for a project
app.get("/project/:projectId/executable", async (c) => {
  const projectId = c.req.param("projectId");
  try {
    const tasks = await taskGraph.getExecutableTasks(projectId);
    return c.json({ tasks, count: tasks.length });
  } catch (err) {
    logError("tasks/executable", err);
    return apiError(c, extractErrorMessage(err));
  }
});

// GET /project/:projectId/cycles - Detect circular dependencies
app.get("/project/:projectId/cycles", async (c) => {
  const projectId = c.req.param("projectId");
  try {
    const cycles = await taskGraph.detectCycles(projectId);
    return c.json({ cycles, hasCycles: cycles.length > 0 });
  } catch (err) {
    logError("tasks/detectCycles", err);
    return apiError(c, extractErrorMessage(err));
  }
});

// POST /decompose - Decompose a task using AI
app.post("/decompose", async (c) => {
  try {
    const body = await c.req.json<{
      objective: string;
      projectId: string;
      agentId?: string;
    }>();

    if (!body.objective?.trim()) {
      return apiError(c, "Objective is required", 400);
    }

    const result = await decomposeTask(body.objective, body.projectId, body.agentId);
    return c.json(result, 201);
  } catch (err) {
    logError("tasks/decompose", err);
    return apiError(c, extractErrorMessage(err));
  }
});

export default app;
