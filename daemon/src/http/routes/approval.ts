import { Hono } from "hono";
import { getRepositories } from "../../persistence/factory.js";
import { apiError, extractErrorMessage, logError } from "../../utils/errors.js";
import { toolRuntime } from "../../runtimes/tool/application/execute-tool.js";
import { executeApprovedTool } from "../../approvals/resume-service.js";
import { handleMessageInConversation } from "../../runtimes/agent/application/conversation.js";

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
 *
 * Returns 202 Accepted. The tool is executed asynchronously and the
 * result is appended to the conversation, then the LLM is re-triggered.
 */
approvalRoutes.post("/:id/approve", async (c) => {
  try {
    const { approvalRequests, toolCallLogs, conversations } = getRepositories();
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

    // Enqueue async resume: execute tool, append result, re-trigger LLM
    const resumePromise = executeApprovedTool(id).then(async (resumeResult) => {
      try {
        // Add tool result message to conversation
        if (existing.runId) {
          const { agentRuns } = getRepositories();
          const run = await agentRuns.getById(existing.runId);
          if (run?.conversationId) {
            await conversations.addMessage(run.conversationId, {
              role: "tool",
              content: JSON.stringify(resumeResult.toolResult),
              toolCallId: existing.toolCallId ?? undefined,
            });

            // Re-trigger LLM to continue the conversation
            await handleMessageInConversation(
              run.conversationId,
              "[System: Tool execution completed. Continue with the conversation.]",
              {
                runtimeContext: {
                  runId: existing.runId,
                  projectId: run.projectId ?? undefined,
                  mode: run.mode,
                },
              },
            );
          }
        }

        await toolCallLogs.create({
          toolId: existing.toolId,
          toolName: existing.toolName,
          source: (existing.source as "mcp" | "native" | "skill" | "rest") ?? "rest",
          args: existing.args,
          resultSuccess: resumeResult.toolResult.success,
          resultData: resumeResult.toolResult.data,
          resultError: resumeResult.toolResult.success ? undefined : String(resumeResult.toolResult.error),
          risk: existing.risk,
          confirmedByUser: true,
        });
      } catch (err) {
        logError("approvals/approve/resume", err);
      }
    });

    // Don't await — return 202 immediately
    resumePromise.catch((err) => logError("approvals/approve/resume-fatal", err));

    return c.json({ data: updated }, 202);
  } catch (err) {
    logError("approvals/approve", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * POST /api/approvals/:id/deny - Deny a pending request
 *
 * Returns 200. The agent run (if any) is updated to reflect the denial.
 */
approvalRoutes.post("/:id/deny", async (c) => {
  try {
    const { approvalRequests, toolCallLogs, agentRuns } = getRepositories();
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

    // Update agent run status if linked
    if (existing.runId) {
      await agentRuns.updateStatus(existing.runId, "failed", "User denied tool approval");
    }

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
