import { Hono } from "hono";
import { getRepositories, apiError, extractErrorMessage, logError, toolRuntime } from "../runtimes/index.js";

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
    const { approvalRequests, toolCallLogs } = getRepositories();
    const id = c.req.param("id");
    const existing = await approvalRequests.getById(id);
    if (!existing) {
      return apiError(c, "Approval request not found", 404);
    }
    if (existing.status !== "pending") {
      return apiError(c, `Approval request is already ${existing.status}`, 400);
    }

    toolRuntime.getPermissionGuard().resolvePendingConfirmation(id, true);
    const updated = await approvalRequests.approve(id);

    // Audit log: approved decision
    const { auditLog } = getRepositories();
    await auditLog.create({
      actor: "user",
      action: "approval.decision",
      resource: `tool:${existing.toolName}`,
      riskLevel: existing.risk,
      permissionDecision: "approve",
      confirmedByUser: true,
      result: "approved",
      metadata: { toolId: existing.toolId, toolName: existing.toolName, approvalId: id },
    });

    await toolCallLogs.create({
      toolId: existing.toolId,
      toolName: existing.toolName,
      source: (existing.source as "mcp" | "native" | "skill" | "rest") ?? "rest",
      args: existing.args,
      resultSuccess: true,
      risk: existing.risk,
      confirmedByUser: true,
    });

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
    const { approvalRequests, toolCallLogs } = getRepositories();
    const id = c.req.param("id");
    const existing = await approvalRequests.getById(id);
    if (!existing) {
      return apiError(c, "Approval request not found", 404);
    }
    if (existing.status !== "pending") {
      return apiError(c, `Approval request is already ${existing.status}`, 400);
    }

    toolRuntime.getPermissionGuard().resolvePendingConfirmation(id, false);
    const updated = await approvalRequests.deny(id);

    // Audit log: denied decision
    const { auditLog } = getRepositories();
    await auditLog.create({
      actor: "user",
      action: "approval.decision",
      resource: `tool:${existing.toolName}`,
      riskLevel: existing.risk,
      permissionDecision: "deny",
      confirmedByUser: false,
      result: "denied",
      metadata: { toolId: existing.toolId, toolName: existing.toolName, approvalId: id },
    });

    await toolCallLogs.create({
      toolId: existing.toolId,
      toolName: existing.toolName,
      source: (existing.source as "mcp" | "native" | "skill" | "rest") ?? "rest",
      args: existing.args,
      resultSuccess: false,
      resultError: "User denied approval",
      risk: existing.risk,
      confirmedByUser: false,
    });

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

    await permissionMemories.create({
      toolId: existing.toolId,
      risk: existing.risk,
      decision: body.decision,
      scope: body.scope ?? "global",
      projectId: body.projectId ?? null,
    });

    if (existing.status === "pending") {
      const approved = body.decision !== "deny";
      toolRuntime.getPermissionGuard().resolvePendingConfirmation(id, approved);
      if (approved) {
        await approvalRequests.approve(id);
      } else {
        await approvalRequests.deny(id);
      }
    }

    return c.json({ success: true });
  } catch (err) {
    logError("approvals/remember", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * POST /api/approvals/expire-stale - Expire stale pending approval requests
 * Called periodically or on startup. Expires approvals older than maxAgeMs.
 */
approvalRoutes.post("/expire-stale", async (c) => {
  try {
    const { approvalRequests } = getRepositories();
    const body = (await c.req.json<{ maxAgeMs?: number }>().catch(() => ({}))) as { maxAgeMs?: number };
    const maxAgeMs = body.maxAgeMs ?? 300_000; // 5 minutes default
    const { count, ids } = await approvalRequests.expireStale(maxAgeMs);
    // Resolve in-memory PermissionGuard confirmations for expired requests
    const guard = toolRuntime.getPermissionGuard();
    for (const id of ids) {
      guard.resolvePendingConfirmation(id, false);
    }
    return c.json({ expired: count });
  } catch (err) {
    logError("approvals/expire-stale", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

export default approvalRoutes;
