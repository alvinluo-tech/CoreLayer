import { Hono } from "hono";
import { getRepositories } from "../../persistence/factory.js";
import { apiError } from "../../shared/errors.js";
import { withErrorHandling } from "../middleware/error-handler.js";
import { logAuditEntry } from "../../persistence/audit-log.js";

const projectRoutes = new Hono();

/**
 * GET /api/projects?workspaceId=... - List projects for a workspace
 */
projectRoutes.get("/", withErrorHandling("projects/list", async (c) => {
  const { projects } = getRepositories();
  const workspaceId = c.req.query("workspaceId");
  if (!workspaceId) {
    return apiError(c, "workspaceId query parameter is required", 400);
  }
  const all = await projects.getByWorkspaceId(workspaceId);
  return c.json({ data: all });
}));

/**
 * GET /api/projects/:id - Get a project by ID
 */
projectRoutes.get("/:id", withErrorHandling("projects/get", async (c) => {
  const { projects } = getRepositories();
  const project = await projects.getById(c.req.param("id")!);
  if (!project) return apiError(c, "Project not found", 404);
  return c.json({ data: project });
}));

/**
 * POST /api/projects - Create a new project
 */
projectRoutes.post("/", withErrorHandling("projects/create", async (c) => {
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

  await logAuditEntry({
    actor: "user",
    action: "project.create",
    resource: `project:${project.id}`,
    decision: "approved",
    result: "created",
    metadata: { id: project.id, name: project.name, workspaceId: body.workspaceId },
  });

  return c.json({ data: project }, 201);
}));

/**
 * PATCH /api/projects/:id - Update a project
 */
projectRoutes.patch("/:id", withErrorHandling("projects/update", async (c) => {
  const { projects } = getRepositories();
  const id = c.req.param("id")!;
  const existing = await projects.getById(id);
  if (!existing) return apiError(c, "Project not found", 404);
  const body = await c.req.json<{
    name?: string;
    description?: string;
    status?: "active" | "archived" | "completed";
  }>();
  const updated = await projects.update(id, body);

  await logAuditEntry({
    actor: "user",
    action: "project.update",
    resource: `project:${id}`,
    decision: "approved",
    result: "updated",
    metadata: { id, changes: Object.keys(body) },
  });

  return c.json({ data: updated });
}));

/**
 * DELETE /api/projects/:id - Delete a project
 */
projectRoutes.delete("/:id", withErrorHandling("projects/delete", async (c) => {
  const { projects } = getRepositories();
  const id = c.req.param("id")!;
  const existing = await projects.getById(id);
  if (!existing) return apiError(c, "Project not found", 404);
  await projects.delete(id);
  await logAuditEntry({
    actor: "user",
    action: "project.delete",
    resource: `project:${id}`,
    decision: "approved",
    result: "deleted",
    metadata: { id, name: existing.name },
  });
  return c.json({ success: true });
}));

export default projectRoutes;
