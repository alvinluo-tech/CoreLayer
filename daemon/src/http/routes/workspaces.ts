import { Hono } from "hono";
import { getRepositories } from "../../persistence/factory.js";
import { apiError, extractErrorMessage, logError } from "../../utils/errors.js";

const workspaceRoutes = new Hono();

/**
 * GET /api/workspaces - List all workspaces for the default owner
 */
workspaceRoutes.get("/", async (c) => {
  try {
    const { workspaces } = getRepositories();
    const all = await workspaces.getByOwnerId("default");
    return c.json({ data: all });
  } catch (err) {
    logError("workspaces/list", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * GET /api/workspaces/:id - Get a workspace by ID
 */
workspaceRoutes.get("/:id", async (c) => {
  try {
    const { workspaces } = getRepositories();
    const ws = await workspaces.getById(c.req.param("id"));
    if (!ws) return apiError(c, "Workspace not found", 404);
    return c.json({ data: ws });
  } catch (err) {
    logError("workspaces/get", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * POST /api/workspaces - Create a new workspace
 */
workspaceRoutes.post("/", async (c) => {
  try {
    const { workspaces } = getRepositories();
    const body = await c.req.json<{ name?: string; description?: string }>();
    const ws = await workspaces.create({
      name: body.name,
      description: body.description,
      ownerId: "default",
    });
    return c.json({ data: ws }, 201);
  } catch (err) {
    logError("workspaces/create", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * PATCH /api/workspaces/:id - Update a workspace
 */
workspaceRoutes.patch("/:id", async (c) => {
  try {
    const { workspaces } = getRepositories();
    const id = c.req.param("id");
    const existing = await workspaces.getById(id);
    if (!existing) return apiError(c, "Workspace not found", 404);
    const body = await c.req.json<{ name?: string; description?: string }>();
    const updated = await workspaces.update(id, body);
    return c.json({ data: updated });
  } catch (err) {
    logError("workspaces/update", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * DELETE /api/workspaces/:id - Delete a workspace
 */
workspaceRoutes.delete("/:id", async (c) => {
  try {
    const { workspaces } = getRepositories();
    const deleted = await workspaces.delete(c.req.param("id"));
    if (!deleted) return apiError(c, "Workspace not found", 404);
    return c.json({ success: true });
  } catch (err) {
    logError("workspaces/delete", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * GET /api/workspaces/default - Get or create default workspace
 */
workspaceRoutes.get("/default", async (c) => {
  try {
    const { workspaces } = getRepositories();
    let ws = await workspaces.getDefault("default");
    if (!ws) {
      ws = await workspaces.create({ name: "Default Workspace", ownerId: "default" });
    }
    return c.json({ data: ws });
  } catch (err) {
    logError("workspaces/default", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

export default workspaceRoutes;
