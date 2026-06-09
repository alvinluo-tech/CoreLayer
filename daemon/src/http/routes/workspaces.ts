import { Hono } from "hono";
import { getRepositories } from "../../persistence/factory.js";
import { apiError, extractErrorMessage, logError } from "../../shared/errors.js";
import { getWorkspaceDetail } from "../../services/workspace-detail.js";
import { db, schema } from "../../persistence/client.js";
import { eq, and } from "drizzle-orm";

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
    const { workspaces, projects } = getRepositories();
    const body = await c.req.json<{ name?: string; description?: string }>();
    const ws = await workspaces.create({
      name: body.name,
      description: body.description,
      ownerId: "default",
    });

    const projectName = body.name
      ? body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
      : "default";
    await projects.create({
      workspaceId: ws.id,
      name: projectName,
      description: body.description,
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

/**
 * GET /api/workspaces/:id/detail - Get full aggregated workspace detail
 */
workspaceRoutes.get("/:id/detail", async (c) => {
  try {
    const detail = await getWorkspaceDetail(c.req.param("id"));
    if (!detail) return apiError(c, "Workspace not found", 404);
    return c.json({ data: detail });
  } catch (err) {
    logError("workspaces/detail", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * POST /api/workspaces/:id/agents - Add agent to workspace
 */
workspaceRoutes.post("/:id/agents", async (c) => {
  try {
    const workspaceId = c.req.param("id");
    const body = await c.req.json<{ agentProfileId: string; roleInWorkspace?: string }>();

    const id = crypto.randomUUID();
    await db.insert(schema.workspaceAgents).values({
      id,
      workspaceId,
      agentProfileId: body.agentProfileId,
      roleInWorkspace: (body.roleInWorkspace as "builder") || "builder",
    });

    return c.json({ data: { id, workspaceId, ...body } }, 201);
  } catch (err) {
    logError("workspaces/add-agent", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * DELETE /api/workspaces/:id/agents/:agentId - Remove agent from workspace
 */
workspaceRoutes.delete("/:id/agents/:agentId", async (c) => {
  try {
    const workspaceId = c.req.param("id");
    const agentId = c.req.param("agentId");

    await db
      .delete(schema.workspaceAgents)
      .where(
        and(
          eq(schema.workspaceAgents.workspaceId, workspaceId),
          eq(schema.workspaceAgents.agentProfileId, agentId)
        )
      );

    return c.json({ success: true });
  } catch (err) {
    logError("workspaces/remove-agent", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * GET /api/workspaces/:id/artifacts - Get artifacts for workspace
 */
workspaceRoutes.get("/:id/artifacts", async (c) => {
  try {
    const workspaceId = c.req.param("id");
    const artifactsList = db
      .select()
      .from(schema.artifacts)
      .where(eq(schema.artifacts.workspaceId, workspaceId))
      .all();

    return c.json({ data: artifactsList });
  } catch (err) {
    logError("workspaces/artifacts", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

export default workspaceRoutes;
