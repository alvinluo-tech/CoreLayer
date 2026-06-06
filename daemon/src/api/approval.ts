import { Hono } from "hono";
import { getRepositories } from "../db/factory.js";
import { apiError, extractErrorMessage, logError } from "../utils/errors.js";

const approvalRoutes = new Hono();

/**
 * GET /api/approvals - List pending approval requests
 */
approvalRoutes.get("/", async (c) => {
  try {
    const { approvalRequests } = getRepositories();
    const pending = await approvalRequests.getPending();
    return c.json({ data: pending });
  } catch (err) {
    logError("approvals/list", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * GET /api/approvals/:id - Get a specific approval request
 */
approvalRoutes.get("/:id", async (c) => {
  try {
    const { approvalRequests } = getRepositories();
    const id = c.req.param("id");
    const request = await approvalRequests.getById(id);
    if (!request) {
      return apiError(c, "Approval request not found", 404);
    }
    return c.json({ data: request });
  } catch (err) {
    logError("approvals/get", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * POST /api/approvals/:id/approve - Approve a pending request
 */
approvalRoutes.post("/:id/approve", async (c) => {
  try {
    const { approvalRequests } = getRepositories();
    const id = c.req.param("id");
    const existing = await approvalRequests.getById(id);
    if (!existing) {
      return apiError(c, "Approval request not found", 404);
    }
    if (existing.status !== "pending") {
      return apiError(c, `Approval request is already ${existing.status}`, 400);
    }
    const updated = await approvalRequests.approve(id);
    return c.json({ data: updated });
  } catch (err) {
    logError("approvals/approve", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * POST /api/approvals/:id/deny - Deny a pending request
 */
approvalRoutes.post("/:id/deny", async (c) => {
  try {
    const { approvalRequests } = getRepositories();
    const id = c.req.param("id");
    const existing = await approvalRequests.getById(id);
    if (!existing) {
      return apiError(c, "Approval request not found", 404);
    }
    if (existing.status !== "pending") {
      return apiError(c, `Approval request is already ${existing.status}`, 400);
    }
    const updated = await approvalRequests.deny(id);
    return c.json({ data: updated });
  } catch (err) {
    logError("approvals/deny", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * POST /api/approvals/:id/remember - Remember the user's decision for this tool
 *
 * Body: { decision: "auto" | "confirm" | "deny", scope?: "global" | "project", projectId?: string }
 */
approvalRoutes.post("/:id/remember", async (c) => {
  try {
    const { approvalRequests, permissionMemories } = getRepositories();
    const id = c.req.param("id");
    const body = await c.req.json<{
      decision: "auto" | "confirm" | "deny";
      scope?: "global" | "project";
      projectId?: string;
    }>();

    if (!body.decision || !["auto", "confirm", "deny"].includes(body.decision)) {
      return apiError(c, "Invalid decision value", 400);
    }

    const existing = await approvalRequests.getById(id);
    if (!existing) {
      return apiError(c, "Approval request not found", 404);
    }

    // Resolve the pending in-memory confirmation if one exists
    // The ToolRuntime holds these; approval-manager handles the DB side

    // Create permission memory
    await permissionMemories.create({
      toolId: existing.toolId,
      risk: existing.risk,
      decision: body.decision,
      scope: body.scope ?? "global",
      projectId: body.projectId ?? null,
    });

    // Also approve the current request
    if (existing.status === "pending") {
      await approvalRequests.approve(id);
    }

    return c.json({ success: true });
  } catch (err) {
    logError("approvals/remember", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

export default approvalRoutes;
