import { Hono } from "hono";
import { getRepositories } from "../../persistence/factory.js";
import { apiError, extractErrorMessage, logError } from "../../shared/errors.js";
import { toolRuntime } from "../../runtimes/tool/public-api.js";
import { executeApprovedTool } from "../../approvals/resume-service.js";
import { handleMessageInConversation } from "../../runtimes/agent/public-api.js";

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
    const { approvalRequests } = getRepositories();
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

    // Enqueue async resume: execute tool, append result, and conditionally re-trigger LLM
    const resumePromise = resumeAndSaveToolResult(id, true);

    // Don't await — return 202 immediately
    resumePromise.catch((err) => logError("approvals/approve/resume-fatal", err));

    return c.json({ data: updated }, 202);
  } catch (err) {
    logError("approvals/approve", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * Reusable helper to execute an approved tool, save the result to database messages,
 * log the audit entry, and optionally re-trigger the LLM to resume conversation.
 */
async function resumeAndSaveToolResult(id: string, triggerLLM: boolean): Promise<void> {
  const { approvalRequests, toolCallLogs, conversations } = getRepositories();
  const existing = await approvalRequests.getById(id);
  if (!existing) return;

  const resumeResult = await executeApprovedTool(id);

  if (existing.runId) {
    const { agentRuns } = getRepositories();
    const run = await agentRuns.getById(existing.runId);
    if (run?.conversationId) {
      await conversations.addMessage(run.conversationId, {
        role: "tool",
        content: JSON.stringify(resumeResult.toolResult),
        toolCallId: existing.toolCallId ?? undefined,
      });

      if (triggerLLM) {
        // Verify if there are other pending approvals for this run before resuming
        const allApprovals = await approvalRequests.getByRunId(existing.runId);
        const pendingApprovals = allApprovals.filter(
          (app) => app.status === "pending" && app.id !== id
        );

        if (pendingApprovals.length === 0) {
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
        } else {
          console.info(`[Approvals] Skipping LLM re-trigger: ${pendingApprovals.length} pending approvals remaining for run ${existing.runId}`);
        }
      }
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
}

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
 * POST /api/approvals/batch/approve - Approve multiple requests at once
 *
 * Executes all specified tools concurrently and re-triggers the LLM
 * only once after all executions complete, preventing duplicate replies.
 */
approvalRoutes.post("/batch/approve", async (c) => {
  try {
    const { approvalRequests, agentRuns, auditLog } = getRepositories();
    const body = await c.req.json<{ ids: string[] }>();
    const ids = body.ids ?? [];

    if (ids.length === 0) {
      return c.json({ data: [] });
    }

    const firstApproval = await approvalRequests.getById(ids[0]);
    const runId = firstApproval?.runId;

    const updatedList = [];
    for (const id of ids) {
      const existing = await approvalRequests.getById(id);
      if (existing && existing.status === "pending") {
        toolRuntime.getPermissionGuard().resolvePendingConfirmation(id, true);
        const updated = await approvalRequests.approve(id);
        updatedList.push(updated);

        // Audit log: approved decision
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
      }
    }

    // Execute approved tools in parallel, wait for all to finish, and trigger LLM exactly once
    const batchResumePromise = (async () => {
      await Promise.all(ids.map((id) => resumeAndSaveToolResult(id, false)));

      if (runId) {
        const run = await agentRuns.getById(runId);
        if (run?.conversationId) {
          await handleMessageInConversation(
            run.conversationId,
            "[System: Batch tool execution completed. Continue with the conversation.]",
            {
              runtimeContext: {
                runId: run.id,
                projectId: run.projectId ?? undefined,
                mode: run.mode,
              },
            },
          );
        }
      }
    })();

    // Don't wait for execution to finish - return 202 Accepted
    batchResumePromise.catch((err) => logError("approvals/batch/approve/resume-fatal", err));

    return c.json({ data: updatedList }, 202);
  } catch (err) {
    logError("approvals/batch/approve", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * POST /api/approvals/batch/deny - Deny multiple requests at once
 */
approvalRoutes.post("/batch/deny", async (c) => {
  try {
    const { approvalRequests, toolCallLogs, agentRuns, auditLog } = getRepositories();
    const body = await c.req.json<{ ids: string[] }>();
    const ids = body.ids ?? [];
    const updatedList = [];

    let runIdToFail: string | null = null;

    for (const id of ids) {
      const existing = await approvalRequests.getById(id);
      if (existing && existing.status === "pending") {
        toolRuntime.getPermissionGuard().resolvePendingConfirmation(id, false);
        const updated = await approvalRequests.deny(id);
        updatedList.push(updated);

        if (existing.runId) {
          runIdToFail = existing.runId;
        }

        // Audit log: denied decision
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

        // Tool call log entry
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
      }
    }

    // Mark the run as failed if any of the approvals in the batch were denied
    if (runIdToFail) {
      await agentRuns.updateStatus(runIdToFail, "failed", "User denied tool approval");
    }

    return c.json({ data: updatedList });
  } catch (err) {
    logError("approvals/batch/deny", err);
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
