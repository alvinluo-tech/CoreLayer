import { Hono } from "hono";
import { getRepositories } from "../../persistence/factory.js";
import { apiError, ErrorCodes } from "../../shared/errors.js";
import { withErrorHandling } from "../middleware/error-handler.js";
import { TaskGraph } from "../../workspaces/task-graph-service.js";
import { decomposeTask } from "../../runtimes/agent/public-api.js";
import { enqueue } from "../../workflow/queue-service.js";

const app = new Hono();
const taskGraph = new TaskGraph();

// GET / - Query tasks
app.get(
  "/",
  withErrorHandling("tasks/list", async (c) => {
    const status = c.req.query("status");
    const priority = c.req.query("priority");
    const projectId = c.req.query("projectId");
    const tasks = await getRepositories().tasks.query({
      status: status ?? undefined,
      priority: priority ? Number(priority) : undefined,
      projectId: projectId ?? undefined,
    });
    return c.json({ tasks, count: tasks.length });
  }),
);

// POST / - Create task
app.post(
  "/",
  withErrorHandling("tasks/create", async (c) => {
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
  }),
);

// GET /:id - Get task by ID
app.get(
  "/:id",
  withErrorHandling("tasks/get", async (c) => {
    const id = c.req.param("id")!;
    const task = await getRepositories().tasks.getById(id);
    if (!task) return apiError(c, "Task not found", 404);
    return c.json({ task });
  }),
);

// PATCH /:id - Update task
app.patch(
  "/:id",
  withErrorHandling("tasks/update", async (c) => {
    const id = c.req.param("id")!;
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
      const msg =
        err instanceof Error ? err.message : String(err);
      return apiError(
        c,
        msg.toLowerCase().includes("not found") ? "Task not found" : msg,
        msg.toLowerCase().includes("not found") ? 404 : 500,
      );
    }
  }),
);

// DELETE /:id - Soft delete task
app.delete(
  "/:id",
  withErrorHandling("tasks/delete", async (c) => {
    const id = c.req.param("id")!;
    await getRepositories().tasks.delete(id);
    return c.json({ success: true });
  }),
);

// GET /project/:projectId - Get tasks by project
app.get(
  "/project/:projectId",
  withErrorHandling("tasks/byProject", async (c) => {
    const projectId = c.req.param("projectId")!;
    const tasks = await getRepositories().tasks.getByProjectId(projectId);
    return c.json({ tasks, count: tasks.length });
  }),
);

// POST /:id/dependencies - Set dependencies for a task
app.post(
  "/:id/dependencies",
  withErrorHandling("tasks/setDependencies", async (c) => {
    const id = c.req.param("id")!;
    try {
      const body = await c.req.json<{ dependencies: string[] }>();
      await taskGraph.setDependencies(id, body.dependencies);
      const task = await getRepositories().tasks.getById(id);
      return c.json({ task });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : String(err);
      return apiError(c, msg, msg.includes("depend on itself") ? 400 : 500);
    }
  }),
);

// GET /:id/can-execute - Check if a task can execute
app.get(
  "/:id/can-execute",
  withErrorHandling("tasks/canExecute", async (c) => {
    const id = c.req.param("id")!;
    const canExecute = await taskGraph.canExecute(id);
    return c.json({ canExecute });
  }),
);

// POST /:id/complete - Mark task as completed and unblock dependents
app.post(
  "/:id/complete",
  withErrorHandling("tasks/complete", async (c) => {
    const id = c.req.param("id")!;
    await taskGraph.completeTask(id);
    const task = await getRepositories().tasks.getById(id);
    return c.json({ task });
  }),
);

// GET /project/:projectId/executable - Get executable tasks for a project
app.get(
  "/project/:projectId/executable",
  withErrorHandling("tasks/executable", async (c) => {
    const projectId = c.req.param("projectId")!;
    const tasks = await taskGraph.getExecutableTasks(projectId);
    return c.json({ tasks, count: tasks.length });
  }),
);

// GET /project/:projectId/cycles - Detect circular dependencies
app.get(
  "/project/:projectId/cycles",
  withErrorHandling("tasks/detectCycles", async (c) => {
    const projectId = c.req.param("projectId")!;
    const cycles = await taskGraph.detectCycles(projectId);
    return c.json({ cycles, hasCycles: cycles.length > 0 });
  }),
);

// POST /decompose - Decompose a task using AI
app.post(
  "/decompose",
  withErrorHandling("tasks/decompose", async (c) => {
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
  }),
);

// POST /:id/start - Start executing a task (enqueue for execution)
app.post(
  "/:id/start",
  withErrorHandling("tasks/start", async (c) => {
    const id = c.req.param("id")!;
    const repos = getRepositories();
    const task = await repos.tasks.getById(id);
    if (!task) {
      return apiError(c, `Task not found: ${id}`, 404, ErrorCodes.NOT_FOUND);
    }

    const entry = await enqueue({
      taskId: id,
      agentId: task.assignedAgentId ?? undefined,
      workspaceId: task.workspaceId ?? undefined,
      projectId: task.projectId ?? undefined,
      mode: "workflow",
    });

    return c.json({ success: true, runId: entry.runId, entry });
  }),
);

// POST /:id/cancel - Cancel a running task's active run
app.post(
  "/:id/cancel",
  withErrorHandling("tasks/cancel", async (c) => {
    const id = c.req.param("id")!;
    const repos = getRepositories();
    const task = await repos.tasks.getById(id);
    if (!task) {
      return apiError(c, `Task not found: ${id}`, 404, ErrorCodes.NOT_FOUND);
    }

    // Find the most recent run for this task and cancel it
    const runs = await repos.agentRuns.getRecent(100);
    const taskRun = runs.find(
      (r) => r.taskId === id && (r.status === "running" || r.status === "queued"),
    );

    if (!taskRun) {
      return apiError(c, "No active run found for this task", 400, ErrorCodes.VALIDATION);
    }

    const { cancelRun } = await import("../../workflow/run-dispatcher.js");
    const cancelled = await cancelRun(taskRun.id);

    return c.json({ success: cancelled, runId: taskRun.id });
  }),
);

export default app;
