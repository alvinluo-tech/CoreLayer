import { Hono } from "hono";
import { getRepositories } from "../../db/factory.js";
import { apiError, extractErrorMessage, logError } from "../../utils/errors.js";

const projectRoutes = new Hono();

/**
 * GET /api/projects?workspaceId=... - List projects for a workspace
 */
projectRoutes.get("/", async (c) => {
  try {
    const { projects } = getRepositories();
    const workspaceId = c.req.query("workspaceId");
    if (!workspaceId) {
      return apiError(c, "workspaceId query parameter is required", 400);
    }
    const all = await projects.getByWorkspaceId(workspaceId);
    return c.json({ data: all });
  } catch (err) {
    logError("projects/list", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * GET /api/projects/:id - Get a project by ID
 */
projectRoutes.get("/:id", async (c) => {
  try {
    const { projects } = getRepositories();
    const project = await projects.getById(c.req.param("id"));
    if (!project) return apiError(c, "Project not found", 404);
    return c.json({ data: project });
  } catch (err) {
    logError("projects/get", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * POST /api/projects - Create a new project
 */
projectRoutes.post("/", async (c) => {
  try {
    const { projects } = getRepositories();
    const body = await c.req.json<{
      workspaceId: string;
      name: string;
      description?: string;
    }>();
    if (!body.workspaceId || !body.name) {
      return apiError(c, "workspaceId and name are required", 400);
    }
    const project = await projects.create({
      workspaceId: body.workspaceId,
      name: body.name,
      description: body.description,
    });
    return c.json({ data: project }, 201);
  } catch (err) {
    logError("projects/create", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * PATCH /api/projects/:id - Update a project
 */
projectRoutes.patch("/:id", async (c) => {
  try {
    const { projects } = getRepositories();
    const id = c.req.param("id");
    const existing = await projects.getById(id);
    if (!existing) return apiError(c, "Project not found", 404);
    const body = await c.req.json<{
      name?: string;
      description?: string;
      status?: "active" | "archived" | "completed";
    }>();
    const updated = await projects.update(id, body);
    return c.json({ data: updated });
  } catch (err) {
    logError("projects/update", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * DELETE /api/projects/:id - Delete a project
 */
projectRoutes.delete("/:id", async (c) => {
  try {
    const { projects } = getRepositories();
    const deleted = await projects.delete(c.req.param("id"));
    if (!deleted) return apiError(c, "Project not found", 404);
    return c.json({ success: true });
  } catch (err) {
    logError("projects/delete", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

export default projectRoutes;
