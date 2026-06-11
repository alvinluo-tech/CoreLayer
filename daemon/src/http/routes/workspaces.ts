import { Hono } from "hono";
import { getRepositories } from "../../persistence/factory.js";
import { apiError } from "../../shared/errors.js";
import { withErrorHandling } from "../middleware/error-handler.js";
import { getWorkspaceDetail } from "../../services/workspace-detail.js";
import { orchestrateFromGoal } from "../../services/workspace-orchestrator.js";
import { db, schema } from "../../persistence/client.js";
import { eq, and } from "drizzle-orm";
import { logAuditEntry } from "../../persistence/audit-log.js";

const workspaceRoutes = new Hono();

/**
 * GET /api/workspaces - List all workspaces for the default owner
 */
workspaceRoutes.get("/", withErrorHandling("workspaces/list", async (c) => {
  const { workspaces } = getRepositories();
  const all = await workspaces.getByOwnerId("default");
  return c.json({ data: all });
}));

/**
 * GET /api/workspaces/default - Get or create default workspace
 * MUST be before /:id to avoid being caught by the param route
 */
workspaceRoutes.get("/default", withErrorHandling("workspaces/default", async (c) => {
  const { workspaces } = getRepositories();
  let ws = await workspaces.getDefault("default");
  if (!ws) {
    ws = await workspaces.create({ name: "Default Workspace", ownerId: "default" });
  }
  return c.json({ data: ws });
}));

/**
 * POST /api/workspaces/from-goal - Full orchestrator pipeline
 * Creates workspace + project + spec + tasks + agents from a goal string
 */
workspaceRoutes.post("/from-goal", withErrorHandling("workspaces/from-goal", async (c) => {
  const body = await c.req.json<{ goal: string }>();
  if (!body.goal?.trim()) {
    return apiError(c, "Goal is required", 400);
  }

  const result = await orchestrateFromGoal(body.goal);
  return c.json({ data: result }, 201);
}));

/**
 * POST /api/workspaces - Create a new workspace
 */
workspaceRoutes.post("/", withErrorHandling("workspaces/create", async (c) => {
  const { workspaces, projects } = getRepositories();
  const body = await c.req.json<{ name?: string; description?: string }>();
  const ws = await workspaces.create({
    name: body.name,
    description: body.description,
    ownerId: "default",
  });

  const projectName = body.name
    ? body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "default"
    : "default";
  await projects.create({
    workspaceId: ws.id,
    name: projectName,
    description: body.description,
  });

  await logAuditEntry({
    actor: "user",
    action: "workspace.create",
    resource: `workspace:${ws.id}`,
    decision: "approved",
    result: "created",
    metadata: { id: ws.id, name: ws.name },
  });

  return c.json({ data: ws }, 201);
}));

/**
 * GET /api/workspaces/:id - Get a workspace by ID
 */
workspaceRoutes.get("/:id", withErrorHandling("workspaces/get", async (c) => {
  const { workspaces } = getRepositories();
  const ws = await workspaces.getById(c.req.param("id")!);
  if (!ws) return apiError(c, "Workspace not found", 404);
  return c.json({ data: ws });
}));

/**
 * PATCH /api/workspaces/:id - Update a workspace
 */
workspaceRoutes.patch("/:id", withErrorHandling("workspaces/update", async (c) => {
  const { workspaces } = getRepositories();
  const id = c.req.param("id")!;
  const existing = await workspaces.getById(id);
  if (!existing) return apiError(c, "Workspace not found", 404);
  const body = await c.req.json<{ name?: string; description?: string; goal?: string; status?: string }>();
  const updated = await workspaces.update(id, {
    ...body,
    status: body.status as "draft" | "planning" | "running" | "blocked" | "succeeded" | "failed" | "cancelled" | undefined,
  });

  await logAuditEntry({
    actor: "user",
    action: "workspace.update",
    resource: `workspace:${id}`,
    decision: "approved",
    result: "updated",
    metadata: { id, changes: Object.keys(body) },
  });

  return c.json({ data: updated });
}));

/**
 * DELETE /api/workspaces/:id - Delete a workspace
 */
workspaceRoutes.delete("/:id", withErrorHandling("workspaces/delete", async (c) => {
  const { workspaces } = getRepositories();
  const id = c.req.param("id")!;
  const existing = await workspaces.getById(id);
  if (!existing) return apiError(c, "Workspace not found", 404);
  await workspaces.delete(id);
  await logAuditEntry({
    actor: "user",
    action: "workspace.delete",
    resource: `workspace:${id}`,
    decision: "approved",
    result: "deleted",
    metadata: { id, name: existing.name },
  });
  return c.json({ success: true });
}));

/**
 * GET /api/workspaces/:id/detail - Get full aggregated workspace detail
 */
workspaceRoutes.get("/:id/detail", withErrorHandling("workspaces/detail", async (c) => {
  const detail = await getWorkspaceDetail(c.req.param("id")!);
  if (!detail) return apiError(c, "Workspace not found", 404);
  return c.json({ data: detail });
}));

/**
 * POST /api/workspaces/:id/agents - Add agent to workspace
 */
workspaceRoutes.post("/:id/agents", withErrorHandling("workspaces/add-agent", async (c) => {
  const workspaceId = c.req.param("id")!;
  const body = await c.req.json<{ agentProfileId: string; roleInWorkspace?: string }>();

  const id = crypto.randomUUID();
  await db.insert(schema.workspaceAgents).values({
    id,
    workspaceId,
    agentProfileId: body.agentProfileId,
    roleInWorkspace: (body.roleInWorkspace as "builder") || "builder",
  });

  return c.json({ data: { id, workspaceId, ...body } }, 201);
}));

/**
 * DELETE /api/workspaces/:id/agents/:agentId - Remove agent from workspace
 */
workspaceRoutes.delete("/:id/agents/:agentId", withErrorHandling("workspaces/remove-agent", async (c) => {
  const workspaceId = c.req.param("id")!;
  const agentId = c.req.param("agentId")!;

  await db
    .delete(schema.workspaceAgents)
    .where(
      and(
        eq(schema.workspaceAgents.workspaceId, workspaceId),
        eq(schema.workspaceAgents.agentProfileId, agentId)
      )
    );

  return c.json({ success: true });
}));

/**
 * GET /api/workspaces/:id/artifacts - Get artifacts for workspace
 */
workspaceRoutes.get("/:id/artifacts", withErrorHandling("workspaces/artifacts", async (c) => {
  const workspaceId = c.req.param("id")!;
  const artifactsList = db
    .select()
    .from(schema.artifacts)
    .where(eq(schema.artifacts.workspaceId, workspaceId))
    .all();

  return c.json({ data: artifactsList });
}));

export default workspaceRoutes;
